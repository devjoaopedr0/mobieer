// Landing page Mobieer: filtro do portfólio e envio do pedido de orçamento.
(function () {
  // O pedido vira lead no comercial do sistema. Para testar local: ?api=http://localhost:3333/api
  var API = new URLSearchParams(location.search).get("api") || "https://mobieerprojetos.com.br/api";

  // Portfólio: mostra só a categoria escolhida
  var buttons = document.querySelectorAll(".filters button");
  var items = document.querySelectorAll(".gallery a");
  function filter(cat) {
    buttons.forEach(function (b) { b.classList.toggle("active", b.dataset.filter === cat); });
    items.forEach(function (a) { a.hidden = a.dataset.cat !== cat; });
  }
  buttons.forEach(function (b) { b.addEventListener("click", function () { filter(b.dataset.filter); }); });
  filter("cozinha");

  // Formulário de orçamento
  var form = document.getElementById("formmob");
  var msg = form.querySelector(".form-msg");
  var button = form.querySelector("button");
  function show(text, error) {
    msg.textContent = text;
    msg.classList.toggle("error", Boolean(error));
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.email || !data.phone || !data.projectType || !data.hasProject) {
      return show("Preencha todos os campos obrigatórios.", true);
    }
    if (!/^\S+@\S+\.\S+$/.test(data.email)) return show("Confira o e-mail.", true);
    button.disabled = true;
    show("Enviando…");
    fetch(API + "/public/orcamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (r) {
        if (!r.ok) throw new Error((r.body && r.body.message) || "Não foi possível enviar.");
        form.reset();
        show(r.body.message || "Recebemos seu pedido! Em breve entraremos em contato.");
      })
      .catch(function (err) {
        show((err && err.message) || "Não foi possível enviar. Tente pelo WhatsApp.", true);
      })
      .finally(function () { button.disabled = false; });
  });
})();
