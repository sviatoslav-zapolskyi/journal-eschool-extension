const menu = document.getElementById('menu');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');

importBtn.addEventListener('click', () => {
  alert('Import clicked');
});

exportBtn.addEventListener('click', () => {
  alert('Export clicked');
});

// Закриття popup при кліку поза меню
document.addEventListener('click', (event) => {
  if (!menu.contains(event.target)) {
    window.close(); // закриває popup
  }
});
