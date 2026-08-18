const sectionSearch = document.getElementById("sectionSearch");
const sectionSearchButton = document.getElementById("sectionSearchButton");

const sectionTasksContainer = document.getElementById(
  "sectionTasksContainer"
);

const sectionEquipmentContainer = document.getElementById(
  "sectionEquipmentContainer"
);

const sectionSalesContainer = document.getElementById(
  "sectionSalesContainer"
);

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

async function loadAcademicData() {
  try {
    const [tasksResponse, equipmentResponse, salesResponse] =
      await Promise.all([
        apiRequest("/tasks"),
        apiRequest("/equipment"),
        apiRequest("/sales")
      ]);

    tasks = tasksResponse.data.filter(
      (item) => item.section === "Academic"
    );

    equipment = equipmentResponse.data.filter(
      (item) => item.section === "Academic"
    );

    sales = salesResponse.data.filter(
      (item) => item.section === "Academic"
    );

    renderAcademicTasks();
    renderAcademicEquipment();
    renderAcademicSales();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function getSearchValue() {
  return sectionSearch.value.trim().toLowerCase();
}

sectionSearch.addEventListener("input", () => {
  renderAcademicTasks();
  renderAcademicEquipment();
  renderAcademicSales();
});

sectionSearchButton.addEventListener("click", () => {
  renderAcademicTasks();
  renderAcademicEquipment();
  renderAcademicSales();
});

function renderAcademicTasks() {
  const searchValue = getSearchValue();

  const filteredTasks = tasks.filter((task) => {
    return (
      task.title.toLowerCase().includes(searchValue) ||
      task.description.toLowerCase().includes(searchValue) ||
      task.category.toLowerCase().includes(searchValue)
    );
  });

  if (!filteredTasks.length) {
    sectionTasksContainer.innerHTML =
      "<p>No academic tasks available.</p>";
    return;
  }

  sectionTasksContainer.innerHTML = filteredTasks
    .slice(0, 6)
    .map(
      (task) => `
      <div class="market-card">

        <div class="market-content">

          <div class="badge">
            Academic Task
          </div>

          <h3>${task.title}</h3>

          <p>
            ${task.description}
          </p>

          <div class="market-footer">

            <div class="market-price">
              R${task.price}
            </div>

            
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

function renderAcademicEquipment() {
  const searchValue = getSearchValue();

  const filteredEquipment = equipment.filter((item) => {
    return (
      item.name.toLowerCase().includes(searchValue) ||
      item.description.toLowerCase().includes(searchValue) ||
      item.category.toLowerCase().includes(searchValue)
    );
  });

  if (!filteredEquipment.length) {
    sectionEquipmentContainer.innerHTML =
      "<p>No academic rentals available.</p>";
    return;
  }

  sectionEquipmentContainer.innerHTML = filteredEquipment
    .slice(0, 6)
    .map(
      (item) => `
      <div class="market-card">

        <div class="market-content">

          <div class="badge">
            Academic Rental
          </div>

          <h3>${item.name}</h3>

          <p>
            ${item.description}
          </p>

          <div class="market-footer">

            <div class="market-price">
              R${item.daily_price}/day
            </div>

            
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

function renderAcademicSales() {
  const searchValue = getSearchValue();

  const filteredSales = sales.filter((item) => {
    return (
      item.title.toLowerCase().includes(searchValue) ||
      item.description.toLowerCase().includes(searchValue) ||
      item.category.toLowerCase().includes(searchValue)
    );
  });

  if (!filteredSales.length) {
    sectionSalesContainer.innerHTML =
      "<p>No academic items for sale.</p>";
    return;
  }

  sectionSalesContainer.innerHTML = filteredSales
    .slice(0, 6)
    .map((item) => {
      return `
        <div class="market-card">

          <div class="market-content">

            <div class="badge">
              Academic Sale
            </div>

            <h3>${item.title}</h3>

            <p>
              ${item.description}
            </p>

            <div class="market-footer">

              <div class="market-price">
                R${item.price}
              </div>

              
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

loadAcademicData();