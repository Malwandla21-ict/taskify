const generalSearch = document.getElementById("generalSearch");
const generalSearchButton = document.getElementById("generalSearchButton");

const generalTasksContainer = document.getElementById("generalTasksContainer");
const generalEquipmentContainer = document.getElementById("generalEquipmentContainer");
const generalSalesContainer = document.getElementById("generalSalesContainer");

const toastContainer = document.getElementById("toastContainer");

const storedToken = localStorage.getItem("taskifyToken");

if (!storedToken) {
  window.location.href = "./login.html";
}

let tasks = [];
let equipment = [];
let sales = [];

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

async function loadGeneralData() {
  try {
    const [tasksResponse, equipmentResponse, salesResponse] = await Promise.all([
      apiRequest("/tasks"),
      apiRequest("/equipment"),
      apiRequest("/sales")
    ]);

    tasks = tasksResponse.data.filter((item) => item.section === "General");
    equipment = equipmentResponse.data.filter((item) => item.section === "General");
    sales = salesResponse.data.filter((item) => item.section === "General");

    renderGeneralTasks();
    renderGeneralEquipment();
    renderGeneralSales();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function getSearchValue() {
  return generalSearch.value.trim().toLowerCase();
}

generalSearch.addEventListener("input", () => {
  renderGeneralTasks();
  renderGeneralEquipment();
  renderGeneralSales();
});

generalSearchButton.addEventListener("click", () => {
  renderGeneralTasks();
  renderGeneralEquipment();
  renderGeneralSales();
});

function renderGeneralTasks() {
  const searchValue = getSearchValue();

  const filteredTasks = tasks.filter((task) => {
    return (
      task.title.toLowerCase().includes(searchValue) ||
      task.description.toLowerCase().includes(searchValue) ||
      task.category.toLowerCase().includes(searchValue) ||
      task.location.toLowerCase().includes(searchValue)
    );
  });

  if (!filteredTasks.length) {
    generalTasksContainer.innerHTML = "<p>No general tasks available.</p>";
    return;
  }

  generalTasksContainer.innerHTML = filteredTasks
    .slice(0, 6)
    .map(
      (task) => `
        <div class="market-card">
          <div class="market-content">
            <div class="badge">General Task</div>

            <h3>${task.title}</h3>

            <p style="color:#6b7280; line-height:1.7;">
              ${task.description}
            </p>

            <div class="market-tags">
              <div class="market-tag">${task.category}</div>
              <div class="market-tag">${task.location}</div>
              ${task.urgent ? `<div class="market-tag">Urgent</div>` : ""}
            </div>

            <div class="market-footer">
              <div class="market-price">R${task.price}</div>

              
                href="./task-details.html?id=${task.id}"
                class="primary-button"
                style="width:auto;padding:12px 18px;"
              >
                View
              </a>
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderGeneralEquipment() {
  const searchValue = getSearchValue();

  const filteredEquipment = equipment.filter((item) => {
    return (
      item.name.toLowerCase().includes(searchValue) ||
      item.description.toLowerCase().includes(searchValue) ||
      item.category.toLowerCase().includes(searchValue)
    );
  });

  if (!filteredEquipment.length) {
    generalEquipmentContainer.innerHTML = "<p>No general rentals available.</p>";
    return;
  }

  generalEquipmentContainer.innerHTML = filteredEquipment
    .slice(0, 6)
    .map(
      (item) => `
        <div class="market-card">
          <div class="market-content">
            <div class="badge">General Rental</div>

            <h3>${item.name}</h3>

            <p style="color:#6b7280; line-height:1.7;">
              ${item.description}
            </p>

            <div class="market-tags">
              <div class="market-tag">${item.category}</div>
              <div class="market-tag">Available</div>
            </div>

            <div class="market-footer">
              <div class="market-price">R${item.daily_price}/day</div>

              
                href="./equipment-details.html?id=${item.id}"
                class="primary-button"
                style="width:auto;padding:12px 18px;"
              >
                View
              </a>
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderGeneralSales() {
  const searchValue = getSearchValue();

  const filteredSales = sales.filter((item) => {
    return (
      item.title.toLowerCase().includes(searchValue) ||
      item.description.toLowerCase().includes(searchValue) ||
      item.category.toLowerCase().includes(searchValue) ||
      item.location.toLowerCase().includes(searchValue)
    );
  });

  if (!filteredSales.length) {
    generalSalesContainer.innerHTML = "<p>No general items for sale.</p>";
    return;
  }

  generalSalesContainer.innerHTML = filteredSales
    .slice(0, 6)
    .map((item) => {
      return `
        <div class="market-card">
          <div class="market-content">
            <div class="badge">General Sale</div>

            <h3>${item.title}</h3>

            <p style="color:#6b7280; line-height:1.7;">
              ${item.description}
            </p>

            <div class="market-tags">
              <div class="market-tag">${item.category}</div>
              <div class="market-tag">${item.condition_status}</div>
              <div class="market-tag">${item.location}</div>
            </div>

            <div class="market-footer">
              <div class="market-price">R${item.price}</div>

              
                href="./sale-details.html?id=${item.id}"
                class="primary-button"
                style="width:auto;padding:12px 18px;"
              >
                View
              </a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

loadGeneralData();