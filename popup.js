// popup.js
const $ = (id) => document.getElementById(id);

chrome.runtime.sendMessage({ action: "getCount" }, (resp) => {
  $("countNum").textContent = resp?.count ?? 0;
});

$("openViewer").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
});
