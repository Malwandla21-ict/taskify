async function loadNavbar() {
  const navbarContainer = document.getElementById("navbarContainer");
  if (!navbarContainer) return;

  try {
    const response = await fetch("./components/navbar.html");
    const navbarHtml = await response.text();
    navbarContainer.innerHTML = navbarHtml;

    highlightActiveLink();
    populateAvatar();
    loadNotificationCount();
    setupLogout();

  } catch (error) {
    console.error("Navbar failed to load:", error);
  }
}

/* ── Active link highlight ── */
function highlightActiveLink() {
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";

  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === `./${currentPage}` || href === currentPage) {
      link.classList.add("active");
    }
  });
}

/* ── Avatar initials from stored user ── */
function populateAvatar() {
  const avatarEl    = document.getElementById("navAvatar");
  const initialsEl  = document.getElementById("navAvatarInitials");
  if (!avatarEl || !initialsEl) return;

  try {
    const raw  = localStorage.getItem("taskifyUser");
    const user = raw ? JSON.parse(raw) : null;

    if (!user) return;

    /* If user has a profile photo, show it */
    if (user.profilePhoto) {
      initialsEl.style.display = "none";
      const img = document.createElement("img");
      img.src = user.profilePhoto;
      img.alt = "Profile photo";
      avatarEl.appendChild(img);
      return;
    }

    /* Otherwise build initials from firstName + lastName or name */
    const first = user.firstName || user.name?.split(" ")[0] || "";
    const last  = user.lastName  || user.name?.split(" ")[1] || "";
    const initials = (first[0] || "") + (last[0] || "");
    initialsEl.textContent = initials.toUpperCase() || "?";

  } catch (e) {
    console.warn("Could not parse taskifyUser:", e);
  }
}

/* ── Notification badge ── */
async function loadNotificationCount() {
  const badge = document.getElementById("navNotifCount");
  if (!badge) return;

  try {
    const token = localStorage.getItem("taskifyToken");
    if (!token) return;

    const res  = await fetch("/api/notifications/unread-count", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;

    const data  = await res.json();
    const count = data.count ?? data.unreadCount ?? 0;

    if (count > 0) {
      badge.textContent    = count > 99 ? "99+" : count;
      badge.style.display  = "flex";
    } else {
      badge.style.display  = "none";
    }

  } catch (e) {
    /* Silently fail — badge stays hidden */
  }
}

/* ── Logout ── */
function setupLogout() {
  const logoutButton = document.getElementById("logoutButton");
  if (!logoutButton) return;

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("taskifyToken");
    localStorage.removeItem("taskifyUser");
    window.location.href = "./login.html";
  });
}

loadNavbar();