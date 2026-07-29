// Lightweight front-end password gate.
// Note: this only hides the UI behind a password prompt for casual access
// control on a personal dashboard. It is NOT real security — the source
// code and data.json are still publicly reachable directly, since GitHub
// Pages requires a public repo on the free plan. Do not rely on this to
// protect sensitive data.
//
// By design, the password is required on every page load/refresh —
// nothing is remembered between visits.

(function () {
  var PASSWORD_HASH = "1a930a57aefb7342b6a760de7f7e5e9fd4bd2beb8c53f86b57ee5a9eb1674468"; // sha256

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

  // body starts with class="locked" in the HTML, so the dashboard is
  // always hidden until the correct password is submitted this load.

  lockForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var hash = await sha256Hex(lockInput.value);
    if (hash === PASSWORD_HASH) {
      lockError.style.display = "none";
      unlock();
    } else {
      lockError.style.display = "block";
      lockInput.value = "";
      lockInput.focus();
    }
  });
})();
