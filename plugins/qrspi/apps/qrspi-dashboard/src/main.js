const buttons = document.querySelectorAll("button[data-command]");

for (const button of buttons) {
  button.addEventListener("click", () => {
    const command = button.getAttribute("data-command");
    button.textContent = command;
    button.setAttribute("aria-label", command);
  });
}
