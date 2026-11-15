/* Sends non-admin visitors away from admin pages.
   The admin APIs are protected on the server too; this only avoids
   showing an empty admin page to someone who isn't allowed to use it. */
(function () {
  document.documentElement.classList.add("admin-checking");

  fetch("api/admin-auth.php", { credentials: "same-origin", cache: "no-store" })
    .then((res) => {
      if (res.status === 401 || res.status === 403) {
        window.location.replace("login.html");
        return;
      }
      document.documentElement.classList.remove("admin-checking");
    })
    .catch(() => {
      document.documentElement.classList.remove("admin-checking");
    });
})();
