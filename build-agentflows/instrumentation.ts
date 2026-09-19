export async function register(){if(process.env.NEXT_RUNTIME==='nodejs'){const {interruptRuns}=await import('@/lib/flow-store');interruptRuns();}}
