const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const emailInput = document.getElementById("email");
const message = document.getElementById("profileMessage");
const saveBtn = document.getElementById("saveProfileBtn");

let userRole = "individual";

/* Each role gets its own navigation on the profile page */
const ROLE_NAV = {
  individual: {
    home: "home.html",
    label: "Member",
    links: [["home.html", "Home"], ["games.html", "Games"], ["my-reports.html", "Complaints"], ["tracked-games.html", "My List"]]
  },
  employee: {
    home: "government-dashboard.html",
    label: "Government Employee",
    links: [["government-dashboard.html", "Dashboard"], ["employee-complaints.html", "Complaints"], ["games.html", "Games"], ["tracked-games.html", "My List"]]
  },
  admin: {
    home: "admin-dashboard.html",
    label: "Administrator",
    links: [["admin-dashboard.html", "Dashboard"], ["admin-games.html", "Games"], ["admin-users.html", "Users"], ["admin-complaints.html", "Complaints"], ["admin-suggestions.html", "Suggestions"]]
  }
};

function applyRoleNav(role) {
  const cfg = ROLE_NAV[role] || ROLE_NAV.individual;
  const nav = document.getElementById("profileNavLinks");
  if (nav) {
    const themeIcon = nav.querySelector("button.icon")?.textContent.trim() || "🌙";
    const avatarIcon = nav.querySelector(".profileIcon")?.textContent.trim() || "👤";
    nav.innerHTML =
      cfg.links.map(([href, text]) => `<a href="${href}">${text}</a>`).join("") +
      `<a class="btn" href="main-home.html">Log Out</a>` +
      `<button onclick="toggleTheme()" class="icon" type="button">${themeIcon}</button>` +
      `<a class="icon profileIcon active" href="profile.html" aria-label="My profile">${avatarIcon}</a>`;
  }
  const logo = document.getElementById("profileLogoLink");
  if (logo) logo.href = cfg.home;

  const badge = document.getElementById("profileRole");
  if (badge) {
    badge.textContent = cfg.label;
    badge.hidden = false;
  }
}

async function loadProfile() {
  const res = await fetch("api/profile.php");
  const data = await res.json();

  if (handleSessionExpired(data)) return;

  if (!data.success) {
    message.textContent = "Cannot load profile.";
    return;
  }

  const user = data.user;
  userRole = String(user.role || "individual").toLowerCase();
  applyRoleNav(userRole);
  document.getElementById("dangerZone").hidden = userRole !== "individual";
  const nameParts = user.name.split(" ");

  firstNameInput.value = nameParts[0] || "";
  lastNameInput.value = nameParts.slice(1).join(" ") || "";
  emailInput.value = user.email || "";
  setAvatar(user.profile_avatar || "default");
  document.getElementById("joinDate").value =
    user.created_at ? String(user.created_at).split(" ")[0] : "";
}

saveBtn.addEventListener("click", async function (e) {
  e.preventDefault();

  const formData = new FormData();
formData.append("first_name", firstNameInput.value.trim());
formData.append("last_name", lastNameInput.value.trim());
formData.append("profile_avatar", selectedAvatar);

  const res = await fetch("api/profile.php", {
    method: "POST",
    body: formData
  });

  const data = await res.json();

if (handleSessionExpired(data)) return;

if (data.success) {
  localStorage.setItem("profile_avatar", selectedAvatar);
  showToast("Profile updated successfully");

  setTimeout(() => {
    window.location.href = (ROLE_NAV[userRole] || ROLE_NAV.individual).home;
  }, 2000);

} else {
  showToast(data.message || "Error updating profile");
}

});

const avatarMap = {
  default: "👤",
  cat: "🐱",
  lion: "🦁",
  rabbit: "🐰",
  owl: "🦉",
  duck: "🦆",
  turtle: "🐢",
  bear: "🐻"
};

let selectedAvatar = "default";

function setAvatar(value) {
  selectedAvatar = value || "default";
  document.getElementById("profileAvatar").textContent =
    avatarMap[selectedAvatar] || avatarMap.default;
}

document.getElementById("openAvatarModal").addEventListener("click", () => {
  document.getElementById("avatarModal").classList.add("show");
});

document.getElementById("closeAvatarModal").addEventListener("click", () => {
  document.getElementById("avatarModal").classList.remove("show");
});

document.querySelectorAll(".avatarOption").forEach(btn => {
  btn.addEventListener("click", () => {
    setAvatar(btn.dataset.avatar);
    document.getElementById("avatarModal").classList.remove("show");
  });
});

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

/* =========================
   DELETE ACCOUNT (individuals)
========================= */
const deleteModal = document.getElementById("deleteAccountModal");
const deletePassword = document.getElementById("deletePassword");
const deleteMsg = document.getElementById("deleteAccountMsg");
const confirmDeleteBtn = document.getElementById("confirmDeleteAccount");

function closeDeleteModal() {
  deleteModal.classList.remove("show");
  deletePassword.value = "";
  deleteMsg.textContent = "";
}

document.getElementById("openDeleteAccount").addEventListener("click", () => {
  deleteMsg.textContent = "";
  deletePassword.value = "";
  deleteModal.classList.add("show");
  setTimeout(() => deletePassword.focus(), 50);
});

document.getElementById("cancelDeleteAccount").addEventListener("click", closeDeleteModal);

deleteModal.addEventListener("click", (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

deletePassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmDeleteBtn.click();
});

confirmDeleteBtn.addEventListener("click", async () => {
  const password = deletePassword.value;
  if (!password) {
    deleteMsg.textContent = "Please enter your password.";
    return;
  }

  confirmDeleteBtn.disabled = true;
  confirmDeleteBtn.textContent = "Deleting…";
  deleteMsg.textContent = "";

  try {
    const res = await fetch("api/delete-account.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Could not delete the account.");

    ["profile_avatar", "role"].forEach((k) => localStorage.removeItem(k));
    deleteModal.querySelector(".confirmBox").innerHTML = `
      <h2>Account deleted</h2>
      <p class="mini">Your personal information has been removed. Thank you for using DIR'A.</p>`;
    setTimeout(() => { window.location.href = "main-home.html"; }, 2200);
  } catch (err) {
    deleteMsg.textContent = err.message;
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.textContent = "Delete my account";
  }
});

loadProfile();
