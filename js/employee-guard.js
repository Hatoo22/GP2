/* Sends visitors who aren't government employees away from employee pages.
   The employee APIs are protected on the server too. */
(function () {
  document.documentElement.classList.add("employee-checking");

  fetch("api/employee-auth.php", { credentials: "same-origin", cache: "no-store" })
    .then((res) => {
      if (res.status === 401 || res.status === 403) {
        window.location.replace("login.html");
        return;
      }
      document.documentElement.classList.remove("employee-checking");
    })
    .catch(() => {
      document.documentElement.classList.remove("employee-checking");
    });
})();
