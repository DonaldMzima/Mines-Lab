const gameOrigin = "https://*.1win.com/*";
const status = document.querySelector("#status");
const grant = document.querySelector("#grant");

function refresh() {
  chrome.permissions.contains({ origins: [gameOrigin] }, (granted) => {
    status.textContent = granted
      ? "1win tab access is granted. Mines Lab can check for approved Mines markers."
      : "Grant access only if you want Mines Lab to check whether an open 1win tab contains an approved Mines marker.";
    grant.hidden = granted;
  });
}

grant.addEventListener("click", () => {
  chrome.permissions.request({ origins: [gameOrigin] }, () => refresh());
});

refresh();
