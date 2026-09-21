"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icons";

type Feedback = { id: number; message: string; error: boolean };
let sequence = 0;
export function toast(message: string, error = false) {
  window.dispatchEvent(
    new CustomEvent("daily-feedback", {
      detail: { id: ++sequence, message, error },
    }),
  );
}
export function useFeedback(notice: string, error = "") {
  useEffect(() => {
    if (notice) toast(notice);
  }, [notice]);
  useEffect(() => {
    if (error) toast(error, true);
  }, [error]);
}
export function ToastRegion() {
  const [items, setItems] = useState<Feedback[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function receive(event: Event) {
      const item = (event as CustomEvent<Feedback>).detail;
      setItems((previous) => [
        ...previous.filter((t) => t.message !== item.message).slice(-1),
        item,
      ]);
      const timer = setTimeout(
        () => {
          setItems((previous) => previous.filter((t) => t.id !== item.id));
          timers.delete(timer);
        },
        item.error ? 12000 : 7000,
      );
      timers.add(timer);
    }
    window.addEventListener("daily-feedback", receive);
    return () => {
      window.removeEventListener("daily-feedback", receive);
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <div className="toast-region" aria-label="Notificações">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast ${item.error ? "toast-error" : ""}`}
          role={item.error ? "alert" : "status"}
        >
          <Icon name={item.error ? "info" : "check"} size={18} />
          <span>{item.message}</span>
          <button
            className="icon-button"
            aria-label="Fechar notificação"
            onClick={() =>
              setItems((previous) => previous.filter((t) => t.id !== item.id))
            }
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
