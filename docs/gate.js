// Lightweight front-end password gate.
// Note: this only hides the UI behind a password prompt for casual access
// control on a personal dashboard. It is NOT real security — the source
// code and data.json are still publicly reachable directly, since GitHub
// Pages requires a public repo on the free plan. Do not rely on this to
// protect sensitive data.
//
// A successful unlock is remembered for the current browser session only.
// This lets users move between dashboard pages and tabs without re-entering
// the password, while requiring it again after the browser is fully closed.

(function () {
  var PASSWORD_HASH = "1a930a57aefb7342b6a760de7f7e5e9fd4bd2beb8c53f86b57ee5a9eb1674468"; // sha256
  var SESSION_KEY = "tw_kd_dashboard_unlocked";

  var lockScreen = document.getElementById("lock-screen");
  var lockForm = document.getElementById("lock-form");
  var lockInput = document.getElementById("lock-input");
  var lockError = document.getElementById("lock-error");

  function unlock() {
    lockScreen.style.display = "none";
    document.body.classList.remove("locked");
  }

  async function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    var buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  // Keep the unlock state only for this browser session and origin.
  if (sessionStorage.getItem(SESSION_KEY) === "true") {
    unlock();
    return;
  }

  lockForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var hash = await sha256Hex(lockInput.value);
    if (hash === PASSWORD_HASH) {
      lockError.style.display = "none";
      sessionStorage.setItem(SESSION_KEY, "true");
      unlock();
    } else {
      lockError.style.display = "block";
      lockInput.value = "";
      lockInput.focus();
    }
  });
})();
