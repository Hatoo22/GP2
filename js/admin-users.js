/* =========================================================
   ADMIN — USERS MANAGEMENT
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const tableBody = $("adminUsersTable");
  const tabs = document.querySelectorAll(".admin-user-tab");
  const searchInput = $("adminUserSearch");
  const statusChips = $("statusChips");
  const pager = $("auPages");
  const showing = $("auShowing");
  const pendingNotice = $("pendingNotice");

  const addAdminBtn = $("addAdminBtn");
  const addAdminModal = $("addAdminModal");
  const newAdminEmail = $("newAdminEmail");
  const cancelAddAdmin = $("cancelAddAdmin");
  const sendAdminInvite = $("sendAdminInvite");
  const addAdminMessage = $("addAdminMessage");

  /* Modal */
  const accountStatusModal = $("accountStatusModal");
  const accountStatusTitle = $("accountStatusTitle");
  const accountStatusAction = $("accountStatusAction");
  const accountStatusUserName = $("accountStatusUserName");
  const accountStatusDescription = $("accountStatusDescription");
  const cancelAccountStatus = $("cancelAccountStatus");
  const confirmAccountStatus = $("confirmAccountStatus");
  const disableAccountFields = $("disableAccountFields");
  const disableReason = $("disableReason");
  const otherDisableReasonField = $("otherDisableReasonField");
  const otherDisableReason = $("otherDisableReason");
  const disableDuration = $("disableDuration");
  const disableAccountMessage = $("disableAccountMessage");

  const PAGE_SIZE = 12;
  const nf = new Intl.NumberFormat("en-US");

  let currentRole = "individual";
  let currentStatus = "all";
  let users = [];
  let page = 1;
  let selectedUser = null;

addAdminBtn.addEventListener(
  "click",
  () => {

    newAdminEmail.value = "";
    addAdminMessage.textContent = "";

    addAdminModal.classList.add(
      "show"
    );

    newAdminEmail.focus();
  }
);


cancelAddAdmin.addEventListener(
  "click",
  () => {

    addAdminModal.classList.remove(
      "show"
    );
  }
);


addAdminModal.addEventListener(
  "click",
  event => {

    if (
      event.target === addAdminModal
    ) {

      addAdminModal.classList.remove(
        "show"
      );
    }
  }
);

sendAdminInvite.addEventListener(
  "click",
  () => {

    const email =
      newAdminEmail.value.trim();

    addAdminMessage.textContent = "";


    if (!email) {
      addAdminMessage.textContent =
        "Please enter an email address.";
      return;
    }


    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (!emailPattern.test(email)) {
      addAdminMessage.textContent =
        "Please enter a valid email address.";
      return;
    }


    sendAdminInvite.disabled = true;
    addAdminMessage.style.color = "";
    addAdminMessage.textContent = "Sending invitation…";

    fetch("api/admin-invite.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        addAdminMessage.textContent = data.message || "Couldn't send the invitation.";
        addAdminMessage.style.color = data.success ? "#16a34a" : "#dc2626";
        if (data.success || data.user_id) {
          newAdminEmail.value = "";
          loadUsers(currentRole);
        }
        if (data.success) {
          setTimeout(() => addAdminModal.classList.remove("show"), 1600);
        }
      })
      .catch(() => {
        addAdminMessage.textContent = "Couldn't connect. Try again.";
        addAdminMessage.style.color = "#dc2626";
      })
      .finally(() => { sendAdminInvite.disabled = false; });
  }
);


  /* =========================================
     HELPERS
  ========================================= */
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const norm = (v) => String(v ?? "").toLowerCase().trim();
  const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
  const statusOf = (u) => norm(u.status || "active");

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(" ", "T"));
    if (isNaN(date)) return value;
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  }

  // stable soft colour per user
  function avatarHue(seed) {
    let h = 0;
    for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  const STATUS_LABEL = { active: "Active", pending: "Pending approval", disabled: "Disabled", invited: "Invited" };

  /* =========================================
     ROW
  ========================================= */
  function actionHtml(user) {
    const status = statusOf(user);
    const isMainAdmin = user.role === "admin" && Number(user.is_main_admin) === 1;
    const id = escapeHtml(user.user_id);

    if (isMainAdmin) return `<span class="au-main">★ Main Admin</span>`;

    if (status === "invited") {
      return `<button class="au-btn au-resend" type="button" data-user-id="${id}">Resend invite</button>`;
    }

    if (status === "active") {
      return `<button class="au-btn au-btn--danger admin-account-action" type="button" data-user-id="${id}">Disable</button>`;
    }
    if (status === "pending") {
      return `<button class="au-btn au-btn--approve admin-account-action" type="button" data-user-id="${id}">✓ Approve</button>`;
    }
    return `<button class="au-btn admin-account-action" type="button" data-user-id="${id}">Enable</button>`;
  }

  function rowHtml(user) {
    const status = statusOf(user);
    const hue = avatarHue(user.email || user.user_id);
    return `
      <tr>
        <td>
          <div class="au-user">
            <span class="au-avatar" style="--h:${hue}">${escapeHtml(initials(user.name))}</span>
            <div class="au-user-text">
              <strong>${escapeHtml(user.name || "Unnamed user")}</strong>
              <span>${escapeHtml(user.email)}</span>
              ${Number(user.spam_count || 0) > 0
                ? `<span class="au-spam" title="${user.spam_count} of ${user.report_count} reports were marked as spam">⚑ ${plural(Number(user.spam_count), "spam report", "spam reports")} of ${nf.format(Number(user.report_count || 0))}</span>`
                : ""}
            </div>
          </div>
        </td>
        <td><span class="au-pill au-pill--${escapeHtml(status)}"><i></i>${escapeHtml(STATUS_LABEL[status] || status)}</span></td>
        <td class="ag-muted">${formatDate(user.created_at)}</td>
        <td class="ag-right">${actionHtml(user)}</td>
      </tr>`;
  }

  /* =========================================
     FILTER + RENDER
  ========================================= */
  function getList() {
    const q = norm(searchInput.value);
    return users.filter((u) => {
      const matchesSearch = !q || norm(u.name).includes(q) || norm(u.email).includes(q);
      const matchesStatus =
        currentStatus === "all" ||
        (currentStatus === "spam" ? Number(u.spam_count || 0) > 0 : statusOf(u) === currentStatus);
      return matchesSearch && matchesStatus;
    });
  }

  function updateStatusCounts() {
    const c = { all: users.length, active: 0, pending: 0, disabled: 0 };
    users.forEach((u) => { const s = statusOf(u); if (s in c) c[s]++; });
    $("stAll").textContent = nf.format(c.all);
    $("stActive").textContent = nf.format(c.active);
    $("stPending").textContent = nf.format(c.pending);
    $("stDisabled").textContent = nf.format(c.disabled);

    // "Sent spam" filter only makes sense for individual users
    const spammers = users.filter((u) => Number(u.spam_count || 0) > 0).length;
    $("stSpam").textContent = nf.format(spammers);
    $("spamChip").hidden = currentRole !== "individual" || spammers === 0;
    if ($("spamChip").hidden && currentStatus === "spam") currentStatus = "all";

    // the pending notice only matters for employees
    if (currentRole === "employee" && c.pending > 0) {
      pendingNotice.hidden = false;
      $("pendingNoticeText").textContent =
        `${c.pending} ${c.pending === 1 ? "account is" : "accounts are"} waiting for your approval`;
    } else {
      pendingNotice.hidden = true;
    }
  }

  function applyFilters() {
    updateStatusCounts();

    const list = getList();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const start = (page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML = slice.length
      ? slice.map(rowHtml).join("")
      : `<tr><td colspan="4" class="dsh-empty">No users found.</td></tr>`;

    showing.textContent = list.length
      ? `Showing ${start + 1}–${start + slice.length} of ${nf.format(list.length)} users`
      : "";

    const nums = new Set([1, pages, page - 1, page, page + 1]);
    const visible = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    let html = `<button type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>`;
    visible.forEach((n, i) => {
      if (i && n - visible[i - 1] > 1) html += `<span class="ag-gap">…</span>`;
      html += `<button type="button" data-page="${n}" class="${n === page ? "is-active" : ""}">${n}</button>`;
    });
    html += `<button type="button" data-page="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="Next page">›</button>`;
    pager.innerHTML = pages > 1 ? html : "";
  }

  function setStatus(status) {
    currentStatus = status;
    statusChips.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.status === status));
    page = 1;
    applyFilters();
  }

  /* counts on the role tabs */
  async function refreshCounts() {
    const roles = { individual: "cntIndividual", employee: "cntEmployee", admin: "cntAdmin" };
    await Promise.all(Object.entries(roles).map(async ([role, id]) => {
      try {
        const r = await fetch(`api/admin-users.php?role=${role}`);
        const d = await r.json();
        if (d.success) $(id).textContent = nf.format(d.count ?? (d.users || []).length);
      } catch { /* keep previous value */ }
    }));
  }

  /* =========================================
     LOAD
  ========================================= */
  async function loadUsers(role) {
    tableBody.innerHTML = `<tr><td colspan="4" class="dsh-empty">Loading users…</td></tr>`;
    showing.textContent = "";
    pager.innerHTML = "";
    try {
      const response = await fetch(`api/admin-users.php?role=${encodeURIComponent(role)}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Unable to load users.");
      users = data.users || [];
      page = 1;
      applyFilters();
    } catch (error) {
      console.error(error);
      users = [];
      updateStatusCounts();
      tableBody.innerHTML = `<tr><td colspan="4" class="dsh-empty">Unable to load users.</td></tr>`;
    }
  }

  /* =========================================
     EVENTS
  ========================================= */
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      currentRole = tab.dataset.role;
      searchInput.value = "";
      currentStatus = "all";
      statusChips.querySelectorAll("button").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.status === "all"));
      addAdminBtn.hidden = currentRole !== "admin";
      loadUsers(currentRole);
    });
  });

  statusChips.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-status]");
    if (b) setStatus(b.dataset.status);
  });

  $("showPendingBtn").addEventListener("click", () => setStatus("pending"));

  searchInput.addEventListener("input", () => { page = 1; applyFilters(); });

  pager.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn || btn.disabled) return;
    page = Number(btn.dataset.page);
    applyFilters();
    document.querySelector(".ag-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

    /* resend an admin invitation */
    tableBody.addEventListener("click", (event) => {
      const btn = event.target.closest(".au-resend");
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Sending…";
      fetch("api/admin-invite.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: Number(btn.dataset.userId), resend: true })
      })
        .then((res) => res.json().catch(() => ({})))
        .then((data) => { btn.textContent = data.success ? "Sent ✓" : "Failed — retry"; if (!data.success) btn.disabled = false; btn.title = data.message || ""; })
        .catch(() => { btn.textContent = "Failed — retry"; btn.disabled = false; });
    });

    /* =========================================
       OPEN ACCOUNT ACTION MODAL
    ========================================= */

    tableBody.addEventListener(
      "click",
      event => {

        const button =
          event.target.closest(
            ".admin-account-action"
          );


        if (!button) {
          return;
        }


        const userId =
          button.dataset.userId;


        const user =
          users.find(
            item =>
              String(
                item.user_id
              ) ===
              String(userId)
          );


        if (!user) {
          return;
        }


        const currentStatus =
          String(
            user.status ||
            "active"
          ).toLowerCase();


        const newStatus =
          currentStatus === "active"
            ? "disabled"
            : "active";


        selectedUser = {
          user_id:
            user.user_id,

          name:
            user.name,

          role:
            user.role,

          current_status:
            currentStatus,

          new_status:
            newStatus
        };


        if (
          newStatus === "disabled"
        ) {

          accountStatusTitle.textContent =
            "Disable Account?";

          accountStatusAction.textContent =
            "disable";

          accountStatusDescription.textContent =
            "The user will no longer be allowed to access their account.";

          confirmAccountStatus.textContent =
            "Disable Account";


          confirmAccountStatus.classList.add(
            "account-disable-confirm"
          );

          confirmAccountStatus.classList.remove(
            "account-enable-confirm"
          );

          disableAccountFields.hidden = false;

disableReason.innerHTML = `
  <option value="">
    Select a reason
  </option>
`;

if (user.role === "individual") {

  disableReason.innerHTML += `
    <option value="report_misuse">
      Misuse of reporting feature
    </option>

    <option value="comment_misuse">
      Spam or misuse of comment feature
    </option>

    <option value="other">
      Other
    </option>
  `;

} else if (user.role === "employee") {

  disableReason.innerHTML += `
    <option value="invalid_institutional_account">
      Invalid or no longer active institutional account
    </option>

    <option value="other">
      Other
    </option>
  `;
}else if (user.role === "admin") {

  disableReason.innerHTML += `
    <option value="no_longer_authorized">
      No longer authorized as an administrator
    </option>

    <option value="other">
      Other
    </option>
  `;
}

disableReason.value = "";
disableDuration.value = "";
otherDisableReason.value = "";
otherDisableReasonField.hidden = true;
disableAccountMessage.textContent = "";


        } else {

          disableAccountFields.hidden = true;

          accountStatusTitle.textContent =
            currentStatus === "pending"
              ? "Activate Account?"
              : "Enable Account?";


          accountStatusAction.textContent =
            currentStatus === "pending"
              ? "activate"
              : "enable";


          accountStatusDescription.textContent =
            "The user will be allowed to access their account.";


          confirmAccountStatus.textContent =
            currentStatus === "pending"
              ? "Activate Account"
              : "Enable Account";


          confirmAccountStatus.classList.add(
            "account-enable-confirm"
          );

          confirmAccountStatus.classList.remove(
            "account-disable-confirm"
          );
        }


        accountStatusUserName.textContent =
          user.name;


        accountStatusModal.classList.add(
          "show"
        );

      }
    );



    /* =========================================
       CANCEL MODAL
    ========================================= */

    cancelAccountStatus.addEventListener(
      "click",
      () => {

        accountStatusModal.classList.remove(
          "show"
        );


        selectedUser =
          null;
      }
    );



    /* Click outside */

    accountStatusModal.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          accountStatusModal
        ) {

          accountStatusModal.classList.remove(
            "show"
          );


          selectedUser =
            null;
        }

      }
    );

    disableReason.addEventListener(
  "change",
  () => {

    const isOther =
      disableReason.value === "other";

    otherDisableReasonField.hidden =
      !isOther;

    if (!isOther) {
      otherDisableReason.value = "";
    }

  }
);



    /* =========================================
       CONFIRM STATUS CHANGE
    ========================================= */

    confirmAccountStatus.addEventListener(
      "click",
      async () => {

        if (!selectedUser) {
          return;
        }

        if (
  selectedUser.new_status === "disabled"
) {

  disableAccountMessage.textContent = "";

  if (!disableReason.value) {
    disableAccountMessage.textContent =
      "Please select a reason.";
    return;
  }

  if (
    disableReason.value === "other" &&
    !otherDisableReason.value.trim()
  ) {
    disableAccountMessage.textContent =
      "Please enter the reason.";
    return;
  }

  if (!disableDuration.value) {
    disableAccountMessage.textContent =
      "Please select a suspension duration.";
    return;
  }
}


        const originalText =
          confirmAccountStatus.textContent;


        confirmAccountStatus.disabled =
          true;


        confirmAccountStatus.textContent =
          selectedUser.new_status ===
          "disabled"
            ? "Disabling..."
            : "Updating...";


        try {

          const response =
            await fetch(
              "api/admin-users.php",
              {

                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body:
  JSON.stringify({

    user_id:
      selectedUser.user_id,

    status:
      selectedUser.new_status,

    disable_reason:
      selectedUser.new_status === "disabled"
        ? (
            disableReason.value === "other"
              ? otherDisableReason.value.trim()
              : disableReason.options[
                  disableReason.selectedIndex
                ].text
          )
        : null,

    disable_duration:
      selectedUser.new_status === "disabled"
        ? disableDuration.value
        : null

  })
              }
            );


          const data =
            await response.json();


          if (!data.success) {

            throw new Error(
              data.message ||
              "Unable to update account."
            );
          }



          /* Update local user */

          const userIndex =
            users.findIndex(
              user =>
                String(
                  user.user_id
                ) ===
                String(
                  selectedUser.user_id
                )
            );


          if (userIndex !== -1) {

            users[userIndex].status =
              data.status;
          }



          applyFilters();
          refreshCounts();



          accountStatusModal.classList.remove(
            "show"
          );


          selectedUser =
            null;


        } catch (error) {

          console.error(error);


          alert(
            error.message ||
            "Unable to update account."
          );


        } finally {

          confirmAccountStatus.disabled =
            false;


          confirmAccountStatus.textContent =
            originalText;
        }

      }
    );



  /* =========================================
     INITIAL PAGE
  ========================================= */
  // open straight on a role from a link, e.g. admin-users.html?role=employee&status=pending
  const params = new URLSearchParams(location.search);
  const startRole = params.get("role");
  const startTab = [...tabs].find((t) => t.dataset.role === startRole);
  if (startTab) {
    tabs.forEach((t) => t.classList.toggle("is-active", t === startTab));
    currentRole = startRole;
    addAdminBtn.hidden = currentRole !== "admin";
  }
  const startStatus = params.get("status");
  if (["active", "pending", "disabled"].includes(startStatus)) {
    currentStatus = startStatus;
    statusChips.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.status === startStatus));
  }

  refreshCounts();
  loadUsers(currentRole);
});
