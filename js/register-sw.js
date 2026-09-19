// Service Workerの登録と更新時の自動リロード。app.js（index.html）・ui-dashboard.js
// （dashboard.html）の両エントリから呼ぶ（スコープはルート共通のため一方の登録で足りるが、
// どちらか一方しか開かない利用も想定し両方から呼んでいる。Issue #28）。
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((reg) => {
      reg.update();
    }).catch(() => {});
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}
