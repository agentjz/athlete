import { elements } from "./dom.js";

let modal;
let pendingResolve;

export function configureConfirmDialog() {
  modal = new bootstrap.Modal(elements.confirmActionModal);
  elements.confirmActionSubmit.addEventListener("click", () => {
    const resolve = pendingResolve;
    pendingResolve = undefined;
    modal.hide();
    resolve?.(true);
  });
  elements.confirmActionModal.addEventListener("hidden.bs.modal", () => {
    const resolve = pendingResolve;
    pendingResolve = undefined;
    resolve?.(false);
  });
}

export function confirmAction(input) {
  elements.confirmActionTitle.textContent = input.title;
  elements.confirmActionBody.textContent = input.body;
  modal.show();
  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}
