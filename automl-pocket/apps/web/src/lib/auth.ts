import bcrypt from "bcryptjs";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import {
  PASSWORD_CHANGE_PATH,
  PASSWORD_CHANGE_RATE_LIMIT,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-change";
import { auditPasswordChange } from "@/lib/password-change-audit";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";
import { SIGNUP_DISABLED_MESSAGE } from "@/lib/setup";
import { hasAccount } from "@/lib/setup-state";

const BCRYPT_ROUNDS = 12;

/**
 * Auditoria de login bem-sucedido e de troca de senha. Sem MFA/Google no
 * Pocket (PRD US-008), o plugin ficou reduzido a dois caminhos: sign-in por
 * email/senha (auth.login) e /change-password (auth.password_changed /
 * auth.password_change_failed, decidido em auditPasswordChange).
 */
function loginAuditPlugin(): BetterAuthPlugin {
  return {
    id: "login-audit",
    hooks: {
      after: [
        {
          matcher: (ctx) =>
            ctx.path === "/sign-in/email" || ctx.path === PASSWORD_CHANGE_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const { ip, userAgent } = requestMeta(
              ctx.request?.headers ?? ctx.headers,
            );
            const newSession = ctx.context.newSession;
            const orgOf = (user: unknown) =>
              ((user as Record<string, unknown>).orgId as string | null) ??
              null;

            if (ctx.path === PASSWORD_CHANGE_PATH) {
              // Com revokeOtherSessions o endpoint apaga as sessões do
              // usuário e cria outra (newSession preenchido); sem ele, e em
              // toda falha, a sessão da requisição continua válida.
              const user =
                newSession?.user ?? (await getSessionFromCtx(ctx))?.user;
              await auditPasswordChange({
                user: user ? { id: user.id, orgId: orgOf(user) } : null,
                returned: ctx.context.returned,
                body: ctx.body,
                headers: ctx.request?.headers ?? ctx.headers,
              });
              return;
            }

            // Login bem-sucedido com email/senha
            if (newSession) {
              await logAudit({
                action: "auth.login",
                orgId: orgOf(newSession.user),
                userId: newSession.user.id,
                ip,
                userAgent,
                metadata: { method: "email" },
              });
            }
          }),
        },
      ],
    },
  };
}

function createAuth() {
  const db = getDb();

  return betterAuth({
    appName: "AutoML",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
      usePlural: true,
    }),
    advanced: {
      database: {
        // Todas as PKs do schema são uuid
        generateId: "uuid",
      },
      // Sem useSecureCookies explícito: o Better Auth marca os cookies como
      // Secure quando BETTER_AUTH_URL é https. Amarrar em NODE_ENV=production
      // quebrava o `docker compose up` local (imagem em produção servida em
      // http://localhost:3000): o browser descartava o cookie de sessão e o
      // login automático do /setup caía em /login.
    },
    user: {
      additionalFields: {
        // Organization pessoal, preenchida pelo databaseHook abaixo
        orgId: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      // Mesmo teto do setupSchema: bcrypt ignora bytes além de 72.
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Conta única do Pocket: sem cadastro público nem verificação de
      // email — completeSetup (app/setup/actions.ts) cria o usuário na tela
      // de primeiro acesso (/setup) e marca emailVerified=true;
      // /sign-up/email fecha em hooks.before.
      requireEmailVerification: false,
      password: {
        hash: (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    rateLimit: {
      // O rate limiter do Better Auth (por IP, memória, só em produção por
      // padrão) já cobre /api/auth/* com a regra default; aqui só a regra
      // específica da troca de senha (US-007): 5/hora, porque a rota confere
      // a senha atual a cada chamada e viraria oráculo para quem já tem a
      // sessão. O 429 chega ao client com status 429 e a UI mostra
      // PASSWORD_CHANGE_MESSAGES.rateLimited.
      customRules: {
        [PASSWORD_CHANGE_PATH]: PASSWORD_CHANGE_RATE_LIMIT,
      },
    },
    plugins: [loginAuditPlugin()],
    databaseHooks: {
      user: {
        create: {
          // Cria a organization pessoal antes do usuário e injeta org_id
          before: async (user) => {
            // Última linha de defesa da conta única: nada de segunda
            // organização órfã se algum caminho furar o hooks.before.
            if (await hasAccount()) {
              throw new APIError("FORBIDDEN", {
                message: SIGNUP_DISABLED_MESSAGE,
              });
            }
            const [org] = await db
              .insert(schema.organizations)
              .values({ name: "My Team" })
              .returning();
            return { data: { ...user, orgId: org.id } };
          },
          after: async (user, ctx) => {
            const { ip, userAgent } = requestMeta(
              ctx?.request?.headers ?? ctx?.headers,
            );

            await logAudit({
              action: "auth.signup",
              orgId: (user.orgId as string | undefined) ?? null,
              userId: user.id,
              ip,
              userAgent,
              metadata: { email: user.email },
            });
          },
        },
      },
    },
    hooks: {
      // Logout: a sessão ainda existe no before; no after já foi revogada
      before: createAuthMiddleware(async (ctx) => {
        // Cadastro público fechado depois da primeira conta (US-002). O
        // signUpEmail server-side de completeSetup passa aqui porque roda
        // antes de existir usuário.
        if (ctx.path === "/sign-up/email" && (await hasAccount())) {
          throw new APIError("FORBIDDEN", { message: SIGNUP_DISABLED_MESSAGE });
        }
        if (ctx.path === "/sign-out") {
          const session = await getSessionFromCtx(ctx);
          if (session) {
            const { ip, userAgent } = requestMeta(
              ctx.request?.headers ?? ctx.headers,
            );
            await logAudit({
              action: "auth.logout",
              orgId: (session.user as Record<string, unknown>).orgId as
                string | null,
              userId: session.user.id,
              ip,
              userAgent,
            });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const { ip, userAgent } = requestMeta(
          ctx.request?.headers ?? ctx.headers,
        );

        // auth.login fica em loginAuditPlugin (registrado depois deste hook
        // global no array de plugins).

        // Falha de login com email/senha (credenciais inválidas etc.)
        if (
          ctx.path === "/sign-in/email" &&
          ctx.context.returned instanceof APIError
        ) {
          const email = (ctx.body as { email?: string } | undefined)?.email;
          const user = email
            ? await ctx.context.internalAdapter.findUserByEmail(email)
            : null;
          await logAudit({
            action: "auth.login_failed",
            orgId: user
              ? ((user.user as Record<string, unknown>).orgId as string | null)
              : null,
            userId: user?.user.id ?? null,
            ip,
            userAgent,
            metadata: { email: email ?? null },
          });
        }
      }),
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

// Singleton lazy: evita abrir o arquivo SQLite durante o build do Next
const globalForAuth = globalThis as unknown as { betterAuth?: Auth };

export function getAuth(): Auth {
  if (!globalForAuth.betterAuth) {
    globalForAuth.betterAuth = createAuth();
  }
  return globalForAuth.betterAuth;
}
