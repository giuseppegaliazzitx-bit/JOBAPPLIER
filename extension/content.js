(function () {
  if (document.getElementById("autoapply-apply")) {
    return;
  }
  const button = document.createElement("button");
  button.id = "autoapply-apply";
  button.type = "button";
  button.textContent = "Apply with my profile";
  button.style.position = "fixed";
  button.style.bottom = "16px";
  button.style.right = "16px";
  button.style.zIndex = "2147483647";
  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "apply", url: location.href });
  });
  document.documentElement.appendChild(button);
})();
