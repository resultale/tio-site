(() => {
  'use strict';
  const API = '/api/site';
  const root = document.getElementById('tio-site');
  const home = root.querySelector('main');
  const page = location.pathname.includes('cadastro-motorista') ? 'motorista' : location.pathname.includes('cadastro-negocio') ? 'negocio' : 'home';
  home.hidden = page !== 'home';
  root.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.dataset.view !== page; });
  root.querySelector('#year').textContent = new Date().getFullYear();
  const menuButton = root.querySelector('.menu-toggle');
  const menu = root.querySelector('#nav-links');
  menuButton.addEventListener('click', () => { menuButton.setAttribute('aria-expanded', String(menu.classList.toggle('open'))); });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { menu.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); }));
  const examples = { corrida: 'Tio, manda uma moto aqui em casa. Vou pro trabalho e pago em dinheiro.', entrega: 'Tio, preciso enviar um pacote. Pode me ajudar com a retirada e a entrega?', delivery: 'Tio, bateu a fome! Quais opções de delivery tem na minha cidade?', servico: 'Tio, quero encontrar uma barbearia perto de mim. Quais opções tem?' };
  root.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('[data-example]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    root.querySelector('#example-text').textContent = '“' + examples[button.dataset.example] + '”';
  }));
  const driver = root.querySelector('[data-view="motorista"]');
  const business = root.querySelector('[data-view="negocio"]');
  const vehicle = driver.querySelector('[name="veiculo"]');
  const motorDocuments = () => driver.querySelectorAll('[data-motor-document]').forEach(label => {
    const bicycle = vehicle.value === 'Bicicleta';
    label.hidden = bicycle; label.querySelector('input').disabled = bicycle; label.querySelector('input').required = !bicycle;
  });
  vehicle.addEventListener('change', motorDocuments); motorDocuments();
  async function get(params, signal) {
    const response = await fetch(API + '?' + new URLSearchParams(params), { signal });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Não foi possível consultar. Tente novamente.');
    return data;
  }
  const citySelects = [...root.querySelectorAll('select[name="cidade"]')];
  citySelects.forEach(select => { select.replaceChildren(new Option('Carregando cidades atendidas…', '')); select.disabled = true; });
  let catalogReady = false;
  const catalog = get({ action: 'catalog' }).then(data => {
    citySelects.forEach(select => {
      select.replaceChildren(new Option('Selecione uma cidade atendida pelo Tio', ''));
      data.cidades.forEach(city => select.add(new Option(city.cidade + (city.uf ? ' — ' + city.uf : ''), city.id)));
      select.disabled = false;
    });
    catalogReady = true;
  }).catch(() => {
    citySelects.forEach(select => { select.replaceChildren(new Option('Consulta indisponível. Recarregue para tentar novamente.', '')); });
    if (page !== 'home') {
      const feedback = root.querySelector('[data-view="' + page + '"] .form-feedback');
      feedback.textContent = 'Não foi possível consultar as cidades. Recarregue a página ou fale com o Tio pelo WhatsApp.';
      feedback.classList.add('error'); feedback.hidden = false;
    }
  });
  const address = business.querySelector('[name="endereco"]');
  const city = business.querySelector('[name="cidade"]');
  const suggestions = business.querySelector('#business-address-suggestions');
  const addressStatus = business.querySelector('#business-address-status');
  let sequence = 0, timer, controller, selected = false;
  const status = text => { addressStatus.textContent = text; addressStatus.hidden = !text; };
  function invalidate() {
    selected = false; sequence++; clearTimeout(timer); controller?.abort(); suggestions.hidden = true;
    ['latitude', 'longitude', 'place_id'].forEach(name => { business.querySelector('[name="' + name + '"]').value = ''; });
    address.setCustomValidity('Selecione um endereço nas sugestões do Google.'); status('');
  }
  city.addEventListener('change', () => { invalidate(); address.value = ''; });
  address.addEventListener('input', () => {
    invalidate(); const text = address.value.trim();
    if (text.length < 3) return;
    if (!city.value) { status('Escolha primeiro a cidade de atuação.'); return; }
    const current = sequence;
    timer = setTimeout(async () => {
      controller = new AbortController(); status('Buscando endereços…');
      try {
        const data = await get({ action: 'autocomplete', cidade: city.value, text }, controller.signal);
        if (current !== sequence) return;
        suggestions.replaceChildren();
        if (!data.sugestoes.length) { status('Nenhum endereço encontrado nesta cidade. Confira a rua e o número.'); return; }
        data.sugestoes.forEach(suggestion => {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = suggestion.descricao;
          button.addEventListener('click', async () => {
            const selection = ++sequence; controller?.abort(); suggestions.hidden = true; selected = false; status('Confirmando endereço…');
            try {
              const result = await get({ action: 'address', cidade: city.value, text: suggestion.descricao });
              if (selection !== sequence) return;
              address.value = result.address;
              business.querySelector('[name="latitude"]').value = result.latitude;
              business.querySelector('[name="longitude"]').value = result.longitude;
              business.querySelector('[name="place_id"]').value = suggestion.place_id;
              address.setCustomValidity(''); selected = true; status('Endereço confirmado. Confira se o número está correto.'); address.focus();
            } catch (error) { if (selection === sequence) status(error.message || 'Não foi possível confirmar o endereço.'); }
          });
          button.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); button.nextElementSibling?.matches('button') && button.nextElementSibling.focus(); }
            if (event.key === 'ArrowUp') { event.preventDefault(); button.previousElementSibling?.focus(); }
            if (event.key === 'Escape') { suggestions.hidden = true; address.focus(); }
          });
          suggestions.append(button);
        });
        const credit = document.createElement('div'); credit.className = 'google-credit'; credit.textContent = 'Sugestões do Google'; suggestions.append(credit);
        suggestions.hidden = false; status('');
      } catch (error) { if (current === sequence && error.name !== 'AbortError') status(error.message || 'Não foi possível buscar endereços.'); }
    }, 350);
  });
  address.addEventListener('keydown', event => {
    if (event.key === 'Escape') suggestions.hidden = true;
    if (event.key === 'ArrowDown' && !suggestions.hidden) { event.preventDefault(); suggestions.querySelector('button')?.focus(); }
  });
  root.querySelectorAll('input[type="file"]').forEach(input => input.addEventListener('change', () => {
    const file = input.files[0]; const max = input.accept.includes('application/pdf') ? 8 : 5;
    input.setCustomValidity(file && file.size > max * 1024 * 1024 ? 'O arquivo precisa ter até ' + max + ' MB.' : '');
    input.reportValidity();
  }));
  root.querySelectorAll('form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const feedback = form.querySelector('.form-feedback'); const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true; feedback.hidden = false; feedback.classList.remove('error'); feedback.textContent = 'Enviando seu cadastro e documentos…';
    try {
      await catalog;
      if (!catalogReady) throw new Error('Recarregue a página para consultar as cidades atendidas.');
      const kind = form.closest('[data-view]').dataset.view;
      if (kind === 'negocio' && !selected) throw new Error('Selecione um endereço nas sugestões do Google.');
      const body = new FormData(form); body.set('tipo_cadastro', kind);
      if (!form.dataset.requestId) form.dataset.requestId = crypto.randomUUID();
      body.set('request_id', form.dataset.requestId);
      const response = await fetch(API, { method: 'POST', body });
      const result = await response.json();
      if (!response.ok || !result.sucesso) throw new Error(result.error || 'Não foi possível enviar seu cadastro.');
      feedback.textContent = result.mensagem + ' Protocolo: ' + result.protocolo;
      form.reset(); delete form.dataset.requestId; motorDocuments(); invalidate();
      feedback.textContent = result.mensagem + ' Protocolo: ' + result.protocolo;
    } catch (error) { feedback.classList.add('error'); feedback.textContent = error.message || 'Não foi possível enviar. Confira sua conexão e tente novamente.'; }
    finally { button.disabled = false; feedback.focus({ preventScroll: true }); feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }));
})();
