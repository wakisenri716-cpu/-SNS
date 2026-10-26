// Tiny app-wide toast ("しおりに保存しました" etc.). Rendered by <Toaster/>
// in the layout; anything can call showToast().
export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; to: string };
}

const EVENT = "jaziba:toast";
let nextId = 1;

export function showToast(text: string, action?: ToastMessage["action"]) {
  window.dispatchEvent(new CustomEvent<ToastMessage>(EVENT, { detail: { id: nextId++, text, action } }));
}

export function onToast(handler: (msg: ToastMessage) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<ToastMessage>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
