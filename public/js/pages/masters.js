import { post, put } from '../api.js';
import { html, raw, ic, inr, inrShort, tabs, mountTable, openModal, toast, options, pill, esc } from '../ui.js';
import { productArt, speciesArt } from '../art.js';
import { can, masters, speciesColor, rerender } from '../app.js';

export async function render(el, { route }) {
  const tab = route.query.get('tab') || 'products';
  const m = await masters(true);
  const edit = can('masters.edit');
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Masters</h1><div class="sub">Products, wood species, suppliers, distributors and locations used across the system</div></div>
      <div class="actions">${edit && tab !== 'locations' ? html`<button class="btn primary" id="add">${ic('plus', 'sm')} Add ${tab === 'species' ? 'species' : tab.slice(0, -1)}</button>` : ''}</div></div>
    ${tabs([{ id: 'products', label: 'Products', icon: 'boxes', count: m.products.length }, { id: 'species', label: 'Wood species', icon: 'tree', count: m.species.length }, { id: 'suppliers', label: 'Suppliers', icon: 'log', count: m.suppliers.length }, { id: 'distributors', label: 'Distributors', icon: 'store', count: m.distributors.length }, { id: 'locations', label: 'Locations', icon: 'map', count: m.locations.length }], tab, '#/masters')}
    ${tab === 'species' ? html`<div class="grid g3">${m.species.map((s) => html`<div class="card" style="overflow:hidden"><div style="height:110px">${raw(speciesArt(s).replace('<svg', '<svg preserveAspectRatio="none" style="width:100%;height:110px;display:block"'))}</div>
      <div class="card-b"><div class="row"><div><h3 style="font-size:16px">${s.name}</h3><div class="small muted"><i>${s.botanical}</i></div></div>${edit ? html`<button class="btn sm" style="margin-left:auto" data-edit-sp="${s.id}">${ic('edit', 'sm')} Edit</button>` : ''}</div>
      <dl class="kv-list mt"><dt>Log rate</dt><dd>${inr(s.logRate)} / CFT</dd><dt>Permit</dt><dd>${s.transitPass ? 'Tree-cutting permit needed' : 'Not needed'}</dd><dt>Products</dt><dd>${m.products.filter((p) => p.species === s.id).length}</dd></dl></div></div>`)}</div>` : html`<div class="card" id="tbl"></div>`}`);
  const box = el.querySelector('#tbl');
  const sp = (id) => m.species.find((x) => x.id === id)?.name || '—';
  if (tab === 'products') {
    mountTable(box, {
      rows: m.products, exportName: 'products', pageSize: 40, onRow: edit ? (r) => productModal(m, r) : null, placeholder: 'Search product, SKU, HSN…',
      filters: [...new Set(m.products.map((p) => p.category))].map((c) => ({ id: c, label: c, test: (r) => r.category === c })),
      columns: [
        { key: 'name', label: 'Product', render: (r) => html`<span class="cell-main"><span class="thumb">${raw(productArt(r, speciesColor(r.species)))}</span><span><div class="n">${r.name}</div><div class="s">${r.sku}</div></span></span>` },
        { key: 'category', label: 'Category' }, { key: 'species', label: 'Species', render: (r) => sp(r.species) }, { key: 'size', label: 'Size' }, { key: 'grade', label: 'Grade' },
        { key: 'sqftPerSheet', label: 'Sq ft / sheet', num: true, render: (r) => r.sqftPerSheet || '—' }, { key: 'rate', label: 'List rate', num: true, render: (r) => (r.sqftPerSheet ? html`${inr(r.rate, 2)}<span class="small muted">/sq ft</span>` : html`${inr(r.rate)}<span class="small muted">/${r.unit}</span>`) }, { key: 'hsn', label: 'HSN', render: (r) => html`<span class="mono">${r.hsn}</span>` },
        { key: 'gst', label: 'GST', num: true, render: (r) => `${r.gst}%` }, { key: 'reorder', label: 'Reorder', num: true }, { key: 'active', label: 'Status', render: (r) => pill(r.active ? 'Active' : 'Disabled') },
      ],
    });
  } else if (tab === 'suppliers') {
    mountTable(box, {
      rows: m.suppliers, exportName: 'suppliers', onRow: edit ? (r) => supplierModal(m, r) : null, columns: [
        { key: 'code', label: 'Code', render: (r) => html`<span class="mono">${r.code}</span>` }, { key: 'name', label: 'Supplier', render: (r) => html`<b>${r.name}</b>` },
        { key: 'type', label: 'Type' }, { key: 'place', label: 'Place' }, { key: 'species', label: 'Supplies', render: (r) => r.species.map(sp).join(', ') },
        { key: 'gstin', label: 'GSTIN', render: (r) => html`<span class="mono small">${r.gstin || 'Unregistered'}</span>` }, { key: 'paymentDays', label: 'Pay in', num: true, render: (r) => `${r.paymentDays} d` }, { key: 'active', label: 'Status', render: (r) => pill(r.active ? 'Active' : 'Disabled') },
      ],
    });
  } else if (tab === 'distributors') {
    mountTable(box, {
      rows: m.distributors, exportName: 'distributor-master', pageSize: 25, onRow: edit ? (r) => distributorModal(m, r) : null, columns: [
        { key: 'code', label: 'Code', render: (r) => html`<span class="mono">${r.code}</span>` }, { key: 'name', label: 'Distributor', render: (r) => html`<b>${r.name}</b>` },
        { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'gstin', label: 'GSTIN', render: (r) => html`<span class="mono small">${r.gstin}</span>` },
        { key: 'creditLimit', label: 'Credit limit', num: true, render: (r) => inrShort(r.creditLimit) }, { key: 'creditDays', label: 'Days', num: true }, { key: 'discount', label: 'Disc.', num: true, render: (r) => `${r.discount}%` },
        { key: 'active', label: 'Status', render: (r) => pill(r.active ? 'Active' : 'Disabled') },
      ],
    });
  } else if (tab === 'locations') {
    mountTable(box, { rows: m.locations, search: false, paginate: false, columns: [{ key: 'id', label: 'Code', render: (r) => html`<span class="mono">${r.id}</span>` }, { key: 'name', label: 'Location', render: (r) => html`<b>${r.name}</b>` }, { key: 'kind', label: 'Type' }] });
  }
  const add = el.querySelector('#add');
  if (add) add.onclick = () => ({ products: () => productModal(m), suppliers: () => supplierModal(m), distributors: () => distributorModal(m), species: () => speciesModal() }[tab]());
  el.querySelectorAll('[data-edit-sp]').forEach((b) => { b.onclick = () => speciesModal(m.species.find((s) => s.id === b.dataset.editSp)); });
}

const save = async (kind, rec, body) => { const r = rec ? await put(`/api/masters/${kind}/${encodeURIComponent(rec.id)}`, body) : await post(`/api/masters/${kind}`, body); toast(`${r.name} saved`); await masters(true); rerender(); };
const v = (x) => esc(x ?? '');

function productModal(m, p) {
  openModal({
    title: p ? `Edit ${p.name}` : 'Add product', submit: 'Save', body: html`<div class="form">
      <div class="field"><label>Name</label><input class="input" name="name" value="${raw(v(p?.name))}" required></div>
      <div class="f3"><div class="field"><label>Type</label><select class="input" name="category">${options([...new Set(['Commercial MR', 'BWR', 'BWP Marine', 'Teak decorative', 'Shuttering', 'Block board', 'Flexible', 'By-products', ...m.products.map((x) => x.category)])].map((c) => ({ id: c, name: c })), p?.category)}</select></div>
        <div class="field"><label>Face wood</label><select class="input" name="species">${options(m.species, p?.species, { placeholder: '— none —' })}</select></div>
        <div class="field"><label>Sold as</label><select class="input" name="unit">${options(['Sheet', 'Nos', 'Kg'].map((c) => ({ id: c, name: c })), p?.unit || 'Sheet')}</select></div></div>
      <div class="f3"><div class="field"><label>Thickness (mm)</label><input class="input" type="number" name="thicknessMm" value="${p?.thicknessMm ?? ''}"></div><div class="field"><label>Sheet size</label><select class="input" name="sqftPerSheet">${options([{ id: 32, name: '8 ft × 4 ft (32 sq ft)' }, { id: 28, name: '7 ft × 4 ft (28 sq ft)' }, { id: 24, name: '6 ft × 4 ft (24 sq ft)' }, { id: 24.01, name: '8 ft × 3 ft (24 sq ft)' }, { id: 0, name: 'Not a sheet' }], p?.sqftPerSheet ?? 32)}</select></div>
        <div class="field"><label>Store in</label><select class="input" name="location">${options(m.locations.filter((l) => l.kind === 'Godown'), p?.location || 'FG')}</select></div></div>
      <div class="f3"><div class="field"><label>List rate (₹ per sq ft, or per unit)</label><input class="input" type="number" step="0.01" name="rate" value="${p?.rate ?? ''}" required></div><div class="field"><label>HSN</label><input class="input" name="hsn" value="${raw(v(p?.hsn))}"></div>
        <div class="field"><label>GST %</label><select class="input" name="gst">${options([0, 5, 12, 18, 28].map((c) => ({ id: c, name: `${c}%` })), p?.gst ?? 18)}</select></div></div>
      <div class="f2"><div class="field"><label>Reorder level</label><input class="input" type="number" name="reorder" value="${p?.reorder ?? 0}"></div><label class="check" style="margin-top:26px"><input type="checkbox" name="active" ${p?.active === false ? '' : raw('checked')}> Active</label></div>
    </div>`,
    onSubmit: (f) => save('products', p, { name: f.name.value, category: f.category.value, species: f.species.value || null, unit: f.unit.value, thicknessMm: f.thicknessMm.value || 0, sqftPerSheet: f.unit.value === 'Sheet' ? Math.round(Number(f.sqftPerSheet.value)) : 0, size: f.thicknessMm.value ? `${f.sqftPerSheet.selectedOptions[0].text.split(' (')[0]} × ${f.thicknessMm.value} mm` : (p?.size || ''), grade: f.category.value, location: f.location.value, rate: f.rate.value, hsn: f.hsn.value, gst: f.gst.value, reorder: f.reorder.value || 0, active: f.active.checked }),
  });
}
function supplierModal(m, s) {
  openModal({
    title: s ? `Edit ${s.name}` : 'Add supplier', submit: 'Save', body: html`<div class="form">
      <div class="field"><label>Name</label><input class="input" name="name" value="${raw(v(s?.name))}" required></div>
      <div class="f3"><div class="field"><label>Type</label><select class="input" name="type">${options(['Farmer', 'Import', 'Trader', 'Depot'].map((c) => ({ id: c, name: c })), s?.type)}</select></div>
        <div class="field"><label>Place</label><input class="input" name="place" value="${raw(v(s?.place))}"></div><div class="field"><label>Phone</label><input class="input" name="phone" value="${raw(v(s?.phone))}"></div></div>
      <div class="f3"><div class="field"><label>Country (for imports)</label><input class="input" name="country" value="${raw(v(s?.country || ''))}" placeholder="Canada / Vietnam / USA"></div><div class="field"><label>GSTIN (blank if unregistered)</label><input class="input" name="gstin" value="${raw(v(s?.gstin))}"></div><div class="field"><label>Payment days</label><input class="input" type="number" name="paymentDays" value="${s?.paymentDays ?? 15}"></div></div>
      <div class="field"><label>Species supplied</label><div class="chips">${m.species.map((x) => html`<label class="check chip"><input type="checkbox" name="sp" value="${x.id}" ${s?.species?.includes(x.id) ? raw('checked') : ''}>${x.name}</label>`)}</div></div>
      <label class="check"><input type="checkbox" name="active" ${s?.active === false ? '' : raw('checked')}> Active</label></div>`,
    onSubmit: (f) => save('suppliers', s, { name: f.name.value, type: f.type.value, country: f.type.value === 'Import' ? f.country.value : null, place: f.place.value, phone: f.phone.value, gstin: f.gstin.value, paymentDays: f.paymentDays.value, species: [...f.querySelectorAll('[name=sp]:checked')].map((i) => i.value), active: f.active.checked }),
  });
}
function distributorModal(m, d) {
  const states = ['Karnataka', 'Kerala', 'Tamil Nadu', 'Andhra Pradesh', 'Telangana', 'Maharashtra', 'Goa', 'Gujarat', 'Other'];
  openModal({
    title: d ? `Edit ${d.name}` : 'Add distributor', submit: 'Save', wide: true, body: html`<div class="form">
      <div class="f2"><div class="field"><label>Name</label><input class="input" name="name" value="${raw(v(d?.name))}" required></div><div class="field"><label>GSTIN</label><input class="input" name="gstin" value="${raw(v(d?.gstin))}"></div></div>
      <div class="f3"><div class="field"><label>City</label><input class="input" name="city" value="${raw(v(d?.city))}"></div><div class="field"><label>State</label><select class="input" name="state">${options(states.map((c) => ({ id: c, name: c })), d?.state || 'Karnataka')}</select></div>
        <div class="field"><label>Territory</label><input class="input" name="territory" value="${raw(v(d?.territory))}"></div></div>
      <div class="f3"><div class="field"><label>Contact person</label><input class="input" name="contact" value="${raw(v(d?.contact))}"></div><div class="field"><label>Phone</label><input class="input" name="phone" value="${raw(v(d?.phone))}"></div></div>
      <div class="f3"><div class="field"><label>Credit limit (₹)</label><input class="input" type="number" name="creditLimit" value="${d?.creditLimit ?? 1000000}"></div><div class="field"><label>Credit days</label><input class="input" type="number" name="creditDays" value="${d?.creditDays ?? 30}"></div>
        <div class="field"><label>Discount %</label><input class="input" type="number" name="discount" value="${d?.discount ?? 0}"></div></div>
      <label class="check"><input type="checkbox" name="active" ${d?.active === false ? '' : raw('checked')}> Active</label></div>`,
    onSubmit: (f) => save('distributors', d, { name: f.name.value, gstin: f.gstin.value, city: f.city.value, state: f.state.value, territory: f.territory.value, contact: f.contact.value, phone: f.phone.value, creditLimit: f.creditLimit.value, creditDays: f.creditDays.value, discount: f.discount.value, active: f.active.checked }),
  });
}
function speciesModal(s) {
  openModal({
    title: s ? `Edit ${s.name}` : 'Add species', submit: 'Save', body: html`<div class="form">
      <div class="f2"><div class="field"><label>Name</label><input class="input" name="name" value="${raw(v(s?.name))}" required></div><div class="field"><label>Botanical name</label><input class="input" name="botanical" value="${raw(v(s?.botanical))}"></div></div>
      <div class="f3"><div class="field"><label>Log rate (₹/CFT)</label><input class="input" type="number" name="logRate" value="${s?.logRate ?? ''}" required></div><div class="field"><label>Colour (for charts)</label><input class="input" type="color" name="color" value="${s?.color || '#b48a5e'}" style="padding:4px"></div>
        <label class="check" style="margin-top:26px"><input type="checkbox" name="transitPass" ${s?.transitPass ? raw('checked') : ''}> Permit needed</label></div></div>`,
    onSubmit: (f) => save('species', s, { name: f.name.value, botanical: f.botanical.value, logRate: f.logRate.value, color: f.color.value, transitPass: f.transitPass.checked }),
  });
}
