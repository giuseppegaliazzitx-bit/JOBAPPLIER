export const SCHOOLS = [
  "Stanford University",
  "MIT",
  "University of Texas at Austin",
  "Reed College",
] as const;

export const COUNTRIES = ["United States", "Canada", "United Kingdom", "Mexico"] as const;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
    label { display: block; margin: 0.75rem 0; }
    .field-error { color: #8c3d1e; font-size: 0.85rem; }
    [role="listbox"] { border: 1px solid #ccc; padding: 0; margin: 0; list-style: none; }
    [role="option"] { padding: 0.35rem 0.6rem; cursor: pointer; }
    [role="option"]:hover { background: #eee; }
    .chip { display: inline-block; background: #eef; padding: 0.15rem 0.5rem; margin-top: 0.35rem; }
    .hidden { display: none; }
  </style>
</head>
<body>
${body}
<script>
(function () {
  document.querySelectorAll("[data-validate]").forEach(function (el) {
    el.addEventListener("blur", function () {
      var wrap = el.closest("label") || el.parentElement;
      if (!wrap) return;
      var err = wrap.querySelector(".field-error");
      if (!err) {
        err = document.createElement("div");
        err.className = "field-error";
        wrap.appendChild(err);
      }
      if (el.getAttribute("required") !== null && !el.value) {
        err.textContent = "This field is required";
      } else {
        err.textContent = "";
      }
    });
  });

  var combo = document.querySelector("[data-widget=combobox]");
  if (combo) {
    var btn = combo.querySelector("[role=combobox]");
    var list = combo.querySelector("[role=listbox]");
    var hidden = combo.querySelector("input[type=hidden]");
    if (btn && list && hidden) {
      btn.addEventListener("click", function () {
        list.hidden = !list.hidden;
        btn.setAttribute("aria-expanded", list.hidden ? "false" : "true");
      });
      list.querySelectorAll("[role=option]").forEach(function (opt) {
        opt.addEventListener("click", function () {
          hidden.value = opt.getAttribute("data-value") || opt.textContent || "";
          btn.textContent = opt.textContent || "";
          list.hidden = true;
          btn.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  var typeahead = document.querySelector("[data-widget=typeahead]");
  if (typeahead) {
    var input = typeahead.querySelector("input[role=combobox]");
    var list = typeahead.querySelector("[role=listbox]");
    var chips = typeahead.querySelector("[data-chip-list]");
    var hidden = typeahead.querySelector("input[type=hidden]");
    var schools = ${JSON.stringify(SCHOOLS)};
    if (input && list && chips && hidden) {
      input.addEventListener("input", function () {
        var q = input.value.toLowerCase();
        list.innerHTML = "";
        schools.filter(function (s) { return s.toLowerCase().indexOf(q) !== -1; }).forEach(function (s) {
          var li = document.createElement("li");
          li.setAttribute("role", "option");
          li.textContent = s;
          li.addEventListener("click", function () {
            hidden.value = s;
            chips.innerHTML = '<span data-chip class="chip">' + s + "</span>";
            input.value = "";
            list.hidden = true;
          });
          list.appendChild(li);
        });
        list.hidden = list.childElementCount === 0;
      });
    }
  }

  var radios = document.querySelectorAll('input[name="work_authorized"]');
  var extra = document.getElementById("visa-wrap");
  radios.forEach(function (r) {
    r.addEventListener("change", function () {
      if (!extra) return;
      extra.classList.toggle("hidden", r.value !== "no" || !r.checked);
    });
  });
})();
</script>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function errorSpan(name: string, errors: Record<string, string>): string {
  const msg = errors[name];
  return `<div class="field-error" data-error-for="${escapeHtml(name)}">${msg ? escapeHtml(msg) : ""}</div>`;
}
