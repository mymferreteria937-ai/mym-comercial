const cfg = window.MM_CONFIG || {};
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY === 'TU_ANON_KEY') alert('Configura app/config.js con tu URL y anon key real de Supabase. Sí, las llaves otra vez.');
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const money = n => `C$ ${Math.ceil(Number(n||0)).toLocaleString('es-NI')}`;
const rawMoney = n => Math.ceil(Number(n||0));
const todayISO = () => new Date().toISOString().slice(0,10);
let products=[], categories=[], sales=[], saleItems=[], clients=[], users=[], cashBoxes=[], cashSessions=[], cart=[], currentRole=localStorage.getItem('mm_role')||'ADMIN', selectedCategory='ALL', selectedCustomer=null, lastSale=null;
function isAdmin(){return currentRole==='ADMIN'} function canSell(){return ['ADMIN','SUPERVISOR','CAJERO'].includes(currentRole)}
function setStatus(t,ok=true){$('#status').textContent=t; $('#statusDot').style.background=ok?'#2f9d76':'#c29b52'}
function bind(){
  $('#roleSelect').value=currentRole; $('#roleSelect').onchange=()=>{currentRole=$('#roleSelect').value;localStorage.setItem('mm_role',currentRole);applyRole()};
  $('#refreshBtn').onclick=loadAll; document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view,b));
  $('#posSearch').oninput=renderPOS; $('#amountReceived').oninput=renderCart; $('#saleDiscount').oninput=renderCart; $('#finishSale').onclick=finishSale; $('#clearCart').onclick=()=>{cart=[];renderCart()};
  $('#paymentMethod').onchange=renderPaymentDetails; $('#newClientQuick').onclick=()=>showView('clients',document.querySelector('[data-view="clients"]'));
  $('#customerSearch').oninput=selectClientBySearch;
  $('#productSearch').oninput=renderProducts; $('#newProductBtn').onclick=()=>{if(guardAdmin())$('#productForm').classList.remove('hidden')}; $('#cancelProduct').onclick=resetProductForm; $('#productForm').onsubmit=saveProduct; $('#purchasePrice').oninput=calcSalePrice; $('#profitMargin').onchange=calcSalePrice; $('#recalculatePrices').onclick=recalcAll35;
  $('#clientFilter').oninput=renderClients; $('#clientForm').onsubmit=saveClient; $('#newClientBtn').onclick=()=>$('#clientForm').reset();
  $('#userForm').onsubmit=saveUser; $('#openCashBtn').onclick=openCash; $('#closeCashBtn').onclick=closeCash; $('#activeCashBox').onchange=()=>localStorage.setItem('mm_cash_session',$('#activeCashBox').value);
  $('#barcodeSearch').oninput=renderLabels; $('#labelQty').oninput=renderLabels; $('#printLabels').onclick=()=>window.print(); $('#profitFilter').onchange=renderProfitability;
  renderPaymentDetails(); renderBankAccounts();
}
function applyRole(){document.querySelectorAll('.adminOnly').forEach(el=>el.classList.toggle('adminLocked',!isAdmin())); $('#subtitle').textContent=isAdmin()?'Modo administrador: costos, márgenes, usuarios y cierres habilitados.':'Modo protegido: precios y costos restringidos.'}
function showView(id,btn){document.querySelectorAll('.view').forEach(v=>v.classList.remove('show'));document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));$('#'+id).classList.add('show');btn?.classList.add('active');$('#title').textContent=btn?btn.textContent:id;if(id==='dashboard')renderDashboard();if(id==='pos'){renderCategoryTabs();renderPOS();renderCart();setTimeout(()=>$('#posSearch').focus(),80)}if(id==='clients')renderClients();if(id==='products')renderProducts();if(id==='cash')renderCash();if(id==='users')renderUsers();if(id==='barcode')renderLabels();if(id==='promos')renderPromos();if(id==='profitability')renderProfitability();if(id==='sales')renderSales()}
async function safeLoad(table, query='*', order='name'){const r=await sb.from(table).select(query).order(order,{ascending:false}); if(r.error){console.warn(table,r.error); return []} return r.data||[]}
async function loadAll(){try{setStatus('Cargando...',false); products=await safeLoad('products','*, categories(name,code)','name'); categories=await safeLoad('categories','*','name'); sales=await safeLoad('sales','*','created_at'); saleItems=await safeLoad('sale_items','*','created_at'); clients=await safeLoad('customers','*','name'); users=await safeLoad('app_users','*','name'); cashBoxes=await safeLoad('cash_boxes','*','name'); cashSessions=await safeLoad('cash_sessions','*','opened_at'); fillCategorySelect(); fillCashSelects(); renderBankAccounts(); renderDashboard(); renderPOS(); renderCart(); renderProducts(); renderClients(); renderUsers(); renderCash(); renderProfitability(); renderSales(); renderPromos(); applyRole(); setStatus('Conectado',true)}catch(e){console.error(e); setStatus('Error',false); alert('Error cargando datos. Revisa RLS o schema_v5_addons.sql.')}}
function profitOf(p){return Number(p.sale_price||0)-Number(p.purchase_price||0)} function realMargin(p){return Number(p.purchase_price)>0?(profitOf(p)/Number(p.purchase_price))*100:0} function potentialProfit(p){return Number(p.stock||0)*profitOf(p)} function productRows(){return products.filter(p=>Number(p.purchase_price)>0)}
function renderDashboard(){const today=todayISO(); const salesToday=sales.filter(s=>(s.created_at||'').slice(0,10)===today); $('#kpiToday').textContent=money(salesToday.reduce((a,s)=>a+Number(s.total||0),0)); $('#kpiProfitToday').textContent=money(salesToday.reduce((a,s)=>a+Number(s.profit_total||0),0)); $('#kpiClients').textContent=clients.length; $('#kpiOpenCash').textContent=cashSessions.filter(s=>s.status==='OPEN').length; $('#kpiLowStock').textContent=products.filter(p=>Number(p.stock)<=Number(p.min_stock)).length; const rows=productRows(); renderProfitTable('#dashTopProfit',rows.slice().sort((a,b)=>profitOf(b)-profitOf(a)).slice(0,8)); renderProfitTable('#dashLowProfit',rows.slice().sort((a,b)=>profitOf(a)-profitOf(b)).slice(0,8)); renderTopClients(); renderPromos('#promoSuggestions')}
function renderProfitTable(sel,rows){$(sel).innerHTML='<tr><th>Producto</th><th>Costo</th><th>Venta</th><th>Gana</th><th>Margen</th></tr>'+rows.map(p=>`<tr><td>${p.internal_code}<br><small>${p.name}</small></td><td>${money(p.purchase_price)}</td><td>${money(p.sale_price)}</td><td class="positive">${money(profitOf(p))}</td><td><span class="tag ${realMargin(p)<35?'red':'green'}">${realMargin(p).toFixed(1)}%</span></td></tr>`).join('')}
function renderTopClients(){const map={}; sales.forEach(s=>{const k=s.customer_id||'eventual'; map[k]=(map[k]||0)+Number(s.total||0)}); const rows=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8); $('#dashTopClients').innerHTML='<tr><th>Cliente</th><th>Total</th></tr>'+rows.map(([id,total])=>`<tr><td>${id==='eventual'?'Cliente eventual':(clients.find(c=>c.id===id)?.name||id)}</td><td>${money(total)}</td></tr>`).join('')}
function renderCategoryTabs(){const tabs=['ALL',...categories.map(c=>c.name)]; $('#categoryTabs').innerHTML=tabs.map(t=>`<button class="${selectedCategory===t?'active':''}" onclick="selectCategory('${t.replaceAll("'","\\'")}')">${t==='ALL'?'Todos':t}</button>`).join('')} window.selectCategory=cat=>{selectedCategory=cat;renderCategoryTabs();renderPOS()}
function filteredProductsForPOS(){const q=($('#posSearch').value||'').toLowerCase().trim();return products.filter(p=>{const cat=p.categories?.name||'';const byCat=selectedCategory==='ALL'||cat===selectedCategory;const text=[p.internal_code,p.supplier_code,p.barcode,p.name,cat].join(' ').toLowerCase();return byCat&&(!q||text.includes(q))}).slice(0,60)}
function renderPOS(){const rows=filteredProductsForPOS();$('#posResults').innerHTML=rows.map(p=>`<article class="productCard ${Number(p.stock)<=Number(p.min_stock)?'low':''}" onclick="addToCart('${p.id}')"><div class="code">${p.internal_code}</div><div class="name">${p.name}</div><div class="price">${money(p.sale_price)}</div><div class="meta"><span>Stock: ${p.stock}</span><span>${p.categories?.name||'General'}</span></div></article>`).join('')||'<div class="cartItems empty">No hay resultados</div>'}
window.addToCart=id=>{if(!canSell())return alert('Este rol no puede vender. Cruel, pero necesario.'); const p=products.find(x=>x.id===id); if(!p)return; if(Number(p.stock)<=0)return alert('Sin stock.'); const i=cart.find(x=>x.id===id); if(i){if(i.qty+1>Number(p.stock))return alert('No hay suficiente stock.');i.qty++}else cart.push({...p,qty:1,unit_price:rawMoney(p.sale_price),unit_cost:Number(p.purchase_price||0)}); $('#posSearch').value='';renderPOS();renderCart()}
function cartSubtotal(){return cart.reduce((a,i)=>a+i.qty*i.unit_price,0)} function saleDiscount(){return Number($('#saleDiscount').value||0)} function saleTotal(){return Math.max(0,cartSubtotal()-saleDiscount())}
function renderCart(){if(!cart.length){$('#cartItems').className='cartItems empty';$('#cartItems').textContent='Carrito vacío'}else{$('#cartItems').className='cartItems';$('#cartItems').innerHTML=cart.map(i=>`<div class="cartLine"><div><b>${i.name}</b><small>${i.internal_code} · ${money(i.unit_price)} · Stock ${i.stock}</small></div><div class="qtyBox"><button onclick="chgQty('${i.id}',-1)">-</button><input value="${i.qty}" onchange="setQty('${i.id}',this.value)"><button onclick="chgQty('${i.id}',1)">+</button></div><button class="removeBtn" onclick="removeItem('${i.id}')">×</button></div>`).join('')} $('#cartSubtotal').textContent=money(cartSubtotal());$('#cartTotal').textContent=money(saleTotal());$('#changePreview').textContent=money(Math.max(0,Number($('#amountReceived').value||0)-saleTotal()))}
window.chgQty=(id,d)=>{const i=cart.find(x=>x.id===id);if(!i)return;const q=i.qty+d;if(q<=0)return removeItem(id);if(q>Number(i.stock))return alert('No hay más stock.');i.qty=q;renderCart()}; window.setQty=(id,v)=>{const i=cart.find(x=>x.id===id);if(!i)return;const q=Math.max(1,Number(v||1));if(q>Number(i.stock))return alert('No hay suficiente stock.');i.qty=q;renderCart()}; window.removeItem=id=>{cart=cart.filter(x=>x.id!==id);renderCart()}
function renderPaymentDetails(){const m=$('#paymentMethod')?.value; $('#bankAccount')?.classList.toggle('hidden',m!=='TRANSFERENCIA'); $('#paymentReference').placeholder=m==='TARJETA'?'Voucher / últimos 4 dígitos':m==='TRANSFERENCIA'?'Referencia de transferencia':'Referencia opcional'}
function renderBankAccounts(){const sel=$('#bankAccount'); if(!sel)return; sel.innerHTML=(cfg.BANK_ACCOUNTS||[]).map(a=>`<option>${a.bank} · ${a.account} · ${a.owner}</option>`).join('')}
function selectClientBySearch(){const q=$('#customerSearch').value.toLowerCase().trim();selectedCustomer=clients.find(c=>[c.name,c.phone,c.email].join(' ').toLowerCase().includes(q));$('#selectedCustomer').textContent=selectedCustomer?`${selectedCustomer.name} · ${selectedCustomer.customer_type||'Cliente'}`:'Cliente eventual'}
async function finishSale(){if(!cart.length)return alert('Carrito vacío.'); const sessionId=$('#activeCashBox').value; if(!sessionId)return alert('Debes abrir/seleccionar caja antes de vender. El dinero necesita dónde caer.'); const total=saleTotal(), received=Number($('#amountReceived').value||0), method=$('#paymentMethod').value; if(method==='EFECTIVO'&&received<total)return alert('Monto recibido menor al total.'); const profit=cart.reduce((a,i)=>a+((i.unit_price-i.unit_cost)*i.qty),0); const salePayload={invoice_no:'MM-'+Date.now(),customer_id:selectedCustomer?.id||null,payment_method:method,subtotal:cartSubtotal(),discount:saleDiscount(),tax:0,total,amount_received:received,change_amount:Math.max(0,received-total),status:'COMPLETED',invoice_type:'TICKET',payment_reference:$('#paymentReference').value||null,cash_session_id:sessionId,profit_total:profit}; const {data:sale,error:se}=await sb.from('sales').insert(salePayload).select().single(); if(se)return alert(se.message); const items=cart.map(i=>({sale_id:sale.id,product_id:i.id,product_code:i.internal_code,product_name:i.name,quantity:i.qty,unit_price:i.unit_price,discount:0,total:i.qty*i.unit_price,unit_cost:i.unit_cost,profit_amount:(i.unit_price-i.unit_cost)*i.qty,profit_margin:i.unit_cost>0?((i.unit_price-i.unit_cost)/i.unit_cost)*100:0})); const {error:ie}=await sb.from('sale_items').insert(items); if(ie)return alert(ie.message); for(const i of cart){await sb.from('products').update({stock:Number(i.stock)-Number(i.qty)}).eq('id',i.id); await sb.from('inventory_movements').insert({product_id:i.id,movement_type:'SALIDA',quantity:i.qty,reference:sale.invoice_no,notes:'Venta POS V5'})} lastSale={...sale,items,customer_name:selectedCustomer?.name||'Cliente eventual'}; renderTicket(lastSale); $('#ticketModal').classList.remove('hidden'); cart=[]; selectedCustomer=null; $('#customerSearch').value=''; $('#amountReceived').value=''; $('#saleDiscount').value='0'; $('#paymentReference').value=''; await loadAll()}
function renderTicket(sale){$('#ticket80').innerHTML=`<h3 class="center">MM FERRETERÍA</h3><div class="center">Marin Mayorga<br>Managua, Nicaragua</div><hr>Factura: ${sale.invoice_no}<br>Fecha: ${new Date(sale.created_at).toLocaleString()}<br>Cliente: ${sale.customer_name}<br>Pago: ${sale.payment_method}<hr>${sale.items.map(i=>`<div><b>${i.product_name}</b><div class="ticketRow"><span>${i.quantity} x ${money(i.unit_price)}</span><span>${money(i.total)}</span></div></div>`).join('')}<hr><div class="ticketRow"><b>Total</b><b>${money(sale.total)}</b></div><div class="ticketRow"><span>Recibido</span><span>${money(sale.amount_received)}</span></div><div class="ticketRow"><span>Cambio</span><span>${money(sale.change_amount)}</span></div><hr><div class="center">Gracias por su compra</div>`} window.printTicket=()=>window.print(); window.closeTicket=()=>$('#ticketModal').classList.add('hidden')
function fillCategorySelect(){$('#categorySelect').innerHTML='<option value="">Sin categoría</option>'+categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
function calcSalePrice(){const c=Number($('#purchasePrice').value||0),m=$('#profitMargin').value;if(m!=='manual')$('#salePrice').value=Math.ceil(c*(1+Number(m)/100))} function guardAdmin(){if(!isAdmin()){alert('Solo Administrador. La caja no es democracia absoluta.');return false}return true}
function resetProductForm(){$('#productForm').reset();$('#productId').value='';$('#productForm').classList.add('hidden')} function renderProducts(){const q=($('#productSearch').value||'').toLowerCase();const rows=products.filter(p=>[p.internal_code,p.supplier_code,p.name,p.categories?.name].join(' ').toLowerCase().includes(q)).slice(0,160);$('#productsTable').innerHTML='<tr><th>Código</th><th>Producto</th><th>Costo</th><th>Margen</th><th>Venta</th><th>Stock</th><th>Ubicación</th><th></th></tr>'+rows.map(p=>`<tr><td>${p.internal_code}<br><small>${p.barcode||''}</small></td><td>${p.name}<br><span class="tag">${p.categories?.name||'General'}</span></td><td>${money(p.purchase_price)}</td><td>${Number(p.profit_margin||35)}%</td><td><b>${money(p.sale_price)}</b></td><td>${p.stock}</td><td>${p.location||''}</td><td><button class="adminOnly ${!isAdmin()?'adminLocked':''}" onclick="editProduct('${p.id}')">Editar</button></td></tr>`).join('')}
window.editProduct=id=>{if(!guardAdmin())return;const p=products.find(x=>x.id===id);$('#productId').value=p.id;$('#supplierCode').value=p.supplier_code||'';$('#productName').value=p.name;$('#categorySelect').value=p.category_id||'';$('#brand').value=p.brand||'';$('#unitType').value=p.unit_type||'UND';$('#purchasePrice').value=p.purchase_price||0;$('#profitMargin').value=p.allow_manual_price?'manual':String(Number(p.profit_margin||35));$('#salePrice').value=rawMoney(p.sale_price);$('#stock').value=p.stock||0;$('#minStock').value=p.min_stock||0;$('#maxStock').value=p.max_stock||0;$('#location').value=p.location||'';$('#productForm').classList.remove('hidden')}
async function saveProduct(e){e.preventDefault();if(!guardAdmin())return;const m=$('#profitMargin').value,manual=m==='manual',cost=Number($('#purchasePrice').value||0),sale=manual?Number($('#salePrice').value||0):Math.ceil(cost*(1+Number(m)/100));const payload={supplier_code:$('#supplierCode').value||null,name:$('#productName').value,category_id:$('#categorySelect').value||null,brand:$('#brand').value||null,unit_type:$('#unitType').value,purchase_price:cost,profit_margin:manual?0:Number(m),allow_manual_price:manual,sale_price:sale,stock:Number($('#stock').value||0),min_stock:Number($('#minStock').value||0),max_stock:Number($('#maxStock').value||0),location:$('#location').value||null,last_cost_update:new Date().toISOString()};let r;if($('#productId').value)r=await sb.from('products').update(payload).eq('id',$('#productId').value);else{const code='MM-GEN-'+Date.now();r=await sb.from('products').insert({...payload,internal_code:code,barcode:code,status:'ACTIVE'})}if(r.error)return alert(r.error.message);resetProductForm();await loadAll()}
async function recalcAll35(){if(!guardAdmin())return;for(const p of products.filter(x=>!x.allow_manual_price&&Number(x.purchase_price)>0))await sb.from('products').update({profit_margin:35,sale_price:Math.ceil(Number(p.purchase_price)*1.35)}).eq('id',p.id);await loadAll();alert('Recalculado al 35% sin decimales.')}
function renderClients(){const q=($('#clientFilter').value||'').toLowerCase();const rows=clients.filter(c=>[c.name,c.phone,c.email,c.customer_type].join(' ').toLowerCase().includes(q));$('#clientsTable').innerHTML='<tr><th>Cliente</th><th>Teléfono</th><th>Tipo</th><th>Estado</th><th>Total compras</th></tr>'+rows.map(c=>`<tr><td>${c.name}<br><small>${c.email||''}</small></td><td>${c.phone||''}</td><td>${c.customer_type||''}</td><td><span class="tag">${c.segment||'NUEVO'}</span></td><td>${money(c.total_spent||0)}</td></tr>`).join('');$('#clientInsights').innerHTML='<tr><th>Métrica</th><th>Valor</th></tr><tr><td>Clientes registrados</td><td>'+clients.length+'</td></tr><tr><td>Clientes frecuentes</td><td>'+clients.filter(c=>c.segment==='FRECUENTE'||c.segment==='VIP').length+'</td></tr>'}
async function saveClient(e){e.preventDefault();const payload={name:$('#clientName').value,phone:$('#clientPhone').value||null,email:$('#clientEmail').value||null,address:$('#clientAddress').value||null,customer_type:$('#clientType').value,segment:'NUEVO'};const r=await sb.from('customers').insert(payload);if(r.error)return alert(r.error.message);$('#clientForm').reset();await loadAll()}
function fillCashSelects(){const open=cashSessions.filter(s=>s.status==='OPEN');$('#activeCashBox').innerHTML='<option value="">Sin caja</option>'+open.map(s=>`<option value="${s.id}">${s.box_name||'Caja'} · ${s.cashier_name||''}</option>`).join('');$('#activeCashBox').value=localStorage.getItem('mm_cash_session')||'';$('#closeCashSession').innerHTML=open.map(s=>`<option value="${s.id}">${s.box_name||'Caja'} · ${s.cashier_name||''}</option>`).join('')}
async function openCash(){const payload={box_name:$('#cashBoxName').value||'Caja 1',opening_amount:Number($('#openingAmount').value||0),cashier_name:$('#cashierName').value||'Cajero',status:'OPEN',opened_at:new Date().toISOString()};const r=await sb.from('cash_sessions').insert(payload);if(r.error)return alert(r.error.message);await loadAll()}
async function closeCash(){const id=$('#closeCashSession').value;if(!id)return;const related=sales.filter(s=>s.cash_session_id===id);const expected=related.reduce((a,s)=>a+Number(s.total||0),0);const counted=Number($('#countedCash').value||0)+Number($('#countedCard').value||0)+Number($('#countedTransfer').value||0);const r=await sb.from('cash_sessions').update({status:'CLOSED',closed_at:new Date().toISOString(),expected_total:expected,counted_total:counted,difference_amount:counted-expected}).eq('id',id);if(r.error)return alert(r.error.message);await loadAll()}
function renderCash(){$('#cashTable').innerHTML='<tr><th>Caja</th><th>Cajero</th><th>Apertura</th><th>Estado</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr>'+cashSessions.map(s=>`<tr><td>${s.box_name}</td><td>${s.cashier_name||''}</td><td>${money(s.opening_amount||0)}</td><td><span class="tag">${s.status}</span></td><td>${money(s.expected_total||0)}</td><td>${money(s.counted_total||0)}</td><td>${money(s.difference_amount||0)}</td></tr>`).join('')}
function renderUsers(){$('#usersTable').innerHTML='<tr><th>Usuario</th><th>Rol</th><th>Estado</th></tr>'+users.map(u=>`<tr><td>${u.name}<br><small>${u.email||''}</small></td><td>${u.role}</td><td>${u.status}</td></tr>`).join('')} async function saveUser(e){e.preventDefault();if(!guardAdmin())return;const r=await sb.from('app_users').insert({name:$('#userName').value,email:$('#userEmail').value||null,phone:$('#userPhone').value||null,role:$('#userRole').value,status:$('#userStatus').value});if(r.error)return alert(r.error.message);$('#userForm').reset();await loadAll()}
function renderLabels(){const q=($('#barcodeSearch').value||'').toLowerCase();const qty=Math.max(1,Number($('#labelQty').value||1));const p=products.find(x=>[x.name,x.internal_code,x.barcode].join(' ').toLowerCase().includes(q))||products[0];if(!p){$('#labelPreview').innerHTML='';return} $('#labelPreview').innerHTML=Array(qty).fill(0).map(()=>`<div class="label"><b>${p.name.slice(0,38)}</b><div class="bars">||||||||</div><small>${p.barcode||p.internal_code}</small><h3>${money(p.sale_price)}</h3></div>`).join('')}
function renderPromos(sel='#promoManager'){const low=products.filter(p=>Number(p.stock)>0).sort((a,b)=>Number(b.stock)-Number(a.stock)).slice(0,6);$(sel).innerHTML=low.map(p=>`<div class="promoCard"><b>Promoción sugerida</b><p>${p.name}</p><small>Stock ${p.stock}. Sugerencia: combo o descuento controlado para mover inventario.</small></div>`).join('')}
function renderProfitability(){let rows=productRows();const f=$('#profitFilter')?.value||'top';if(f==='top')rows.sort((a,b)=>profitOf(b)-profitOf(a));if(f==='low')rows.sort((a,b)=>profitOf(a)-profitOf(b));if(f==='margin-low')rows=rows.filter(p=>realMargin(p)<35).sort((a,b)=>realMargin(a)-realMargin(b));$('#profitTable').innerHTML='<tr><th>Código</th><th>Producto</th><th>Costo</th><th>Venta</th><th>Gana</th><th>Margen</th><th>Potencial</th></tr>'+rows.slice(0,80).map(p=>`<tr><td>${p.internal_code}</td><td>${p.name}</td><td>${money(p.purchase_price)}</td><td>${money(p.sale_price)}</td><td>${money(profitOf(p))}</td><td>${realMargin(p).toFixed(1)}%</td><td>${money(potentialProfit(p))}</td></tr>`).join('')}
function renderSales(){$('#salesTable').innerHTML='<tr><th>Factura</th><th>Fecha</th><th>Método</th><th>Total</th><th>Utilidad</th></tr>'+sales.map(s=>`<tr><td>${s.invoice_no}</td><td>${new Date(s.created_at).toLocaleString()}</td><td>${s.payment_method}</td><td>${money(s.total)}</td><td>${money(s.profit_total||0)}</td></tr>`).join('')}


/* =====================================================
   V6 Azul: mejoras de inventario, etiquetas y caja
===================================================== */
function escapeHtmlV6(value=''){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}
function titleCaseV6(str=''){
  return String(str).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function cleanProductNameV6(p){
  if(p.clean_name) return p.clean_name;
  let n = String(p.name || '').replace(/\s+/g,' ').trim();
  n = n.replace(/^\d+\s+/,'').replace(/^(UYUSTOOLS|FEDERALLI|INGCO|UDUKE|FYY|CLEVER)\s+/i,'');
  return titleCaseV6(n).slice(0,92);
}
function brandFromProductV6(p){
  if(p.brand) return p.brand;
  const n = String(p.name||'').toUpperCase();
  const brands = ['FEDERALLI','INGCO','UDUKE','UYUSTOOLS','FYY','CLEVER','WADFOW','AQUA BLUE','LIKA'];
  return brands.find(b=>n.includes(b)) || 'Sin marca';
}
function stockClassV6(stock,min){
  stock = Number(stock||0); min = Number(min||0);
  if(stock <= 0) return 'stock-danger';
  if(stock <= min) return 'stock-warning';
  return 'stock-ok';
}
function stockStatusV6(stock,min){
  stock = Number(stock||0); min = Number(min||0);
  if(stock <= 0) return 'Agotado';
  if(stock <= min) return 'Stock bajo';
  return 'Disponible';
}
function unitLabelV6(u){
  const map = {UND:'Pzas',PZA:'Pzas',PZAS:'Pzas',PAQ:'Paqs',CAJA:'Cajas',SET:'Set',MTS:'Mts',M:'Mts',KG:'Kg',LBS:'Lbs',LTR:'Lts'};
  return map[String(u||'UND').toUpperCase()] || String(u||'UND');
}
renderProducts = function(){
  const q = ($('#productSearch')?.value||'').toLowerCase();
  const rows = products.filter(p=>[
    p.internal_code,p.supplier_code,p.barcode,p.name,p.clean_name,p.brand,p.location,p.categories?.name
  ].join(' ').toLowerCase().includes(q)).slice(0,160);
  const html = rows.map(p=>{
    const cls = stockClassV6(p.stock,p.min_stock);
    const status = stockStatusV6(p.stock,p.min_stock);
    const cat = p.categories?.name || 'General';
    return `<div class="inventory-card ${cls}">
      <div class="product-code-block">
        <span class="sku">${escapeHtmlV6(p.internal_code)}</span>
        <span class="category-pill">${escapeHtmlV6(cat)}</span>
      </div>
      <div class="product-info">
        <div class="product-name">${escapeHtmlV6(cleanProductNameV6(p))}</div>
        <div class="product-meta">${escapeHtmlV6(brandFromProductV6(p))} • Ref: ${escapeHtmlV6(p.supplier_code || 'N/D')}</div>
      </div>
      <div class="location-block">
        <span class="location-label">Ubicación</span>
        <span class="location-value">${escapeHtmlV6(p.location || 'Sin ubicación')}</span>
      </div>
      <div class="stock-block">
        <span class="stock-number">${Math.ceil(Number(p.stock||0))}</span>
        <span class="stock-unit">${escapeHtmlV6(unitLabelV6(p.unit_type))}</span>
        <span class="stock-status">${status}</span>
      </div>
      <div class="price-block">
        <span class="price-label">Precio</span>
        <span class="price-value">${money(p.sale_price)}</span>
      </div>
      <button class="edit-btn adminOnly ${!isAdmin()?'adminLocked':''}" onclick="editProduct('${p.id}')">Editar</button>
    </div>`;
  }).join('') || '<div class="cartItems empty">No hay productos para mostrar</div>';
  $('#productsTable').outerHTML = `<div id="productsTable" class="inventory-list">${html}</div>`;
};

function currentUserV6(){
  const role = currentRole || localStorage.getItem('mm_role') || 'ADMIN';
  return {
    id: localStorage.getItem('mm_user_id') || role.toLowerCase(),
    name: localStorage.getItem('mm_user_name') || (role === 'ADMIN' ? 'Administrador' : role),
    role
  };
}
fillCashSelects = function(){
  const open = cashSessions.filter(s=>s.status==='OPEN');
  const boxSelect = $('#cashBoxName');
  if(boxSelect){
    boxSelect.innerHTML = '<option value="">Seleccionar caja</option>' +
      (cashBoxes.length ? cashBoxes : [{id:'Caja 1',name:'Caja 1'},{id:'Caja 2',name:'Caja 2'},{id:'Caja 3',name:'Caja 3'}])
      .map(b=>`<option value="${escapeHtmlV6(b.id||b.name)}">${escapeHtmlV6(b.name||b.box_name||b.id)}</option>`).join('');
  }
  const u=currentUserV6();
  if($('#cashierName')) $('#cashierName').value = u.name;
  $('#activeCashBox').innerHTML='<option value="">Sin caja</option>'+open.map(s=>`<option value="${s.id}">${escapeHtmlV6(s.box_name||'Caja')} · ${escapeHtmlV6(s.cashier_name||'')}</option>`).join('');
  $('#activeCashBox').value=localStorage.getItem('mm_cash_session')||'';
  $('#closeCashSession').innerHTML = open.length ? open.map(s=>`<option value="${s.id}">${escapeHtmlV6(s.box_name||'Caja')} · ${escapeHtmlV6(s.cashier_name||'')}</option>`).join('') : '<option value="">No hay cajas abiertas</option>';
  if($('#cashOpenStatus')) $('#cashOpenStatus').textContent = open.length ? `${open.length} caja(s) abierta(s)` : 'Sin caja abierta';
};
openCash = async function(){
  const u=currentUserV6();
  const boxId = $('#cashBoxName')?.value;
  const box = cashBoxes.find(b=>String(b.id)===String(boxId)) || {name: boxId || 'Caja 1'};
  if(!boxId) return alert('Selecciona una caja. La caja no puede ser imaginaria, por triste que suene.');
  const alreadyOpen = cashSessions.some(s=>s.status==='OPEN' && String(s.cash_box_id||s.box_name)===String(boxId));
  if(alreadyOpen) return alert('Esta caja ya tiene una sesión abierta.');
  const openingNio = Number($('#openingAmount')?.value||0);
  const openingUsd = Number($('#openingAmountUsd')?.value||0);
  const payload={cash_box_id: box.id && box.id!==box.name ? box.id : null, box_name: box.name||box.box_name||'Caja', opening_amount:openingNio, opening_cash_nio:openingNio, opening_cash_usd:openingUsd, expected_cash_nio:openingNio, expected_cash_usd:openingUsd, cashier_name:u.name, opened_by:u.id, status:'OPEN', opened_at:new Date().toISOString()};
  const r=await sb.from('cash_sessions').insert(payload);
  if(r.error) return alert(r.error.message);
  $('#openingAmount').value='';
  if($('#openingAmountUsd')) $('#openingAmountUsd').value='';
  await loadAll();
};
const denominationsV6 = [0.50,1,5,10,20,50,100,200,500,1000];
window.openCashBreakdown = function(){
  const list = $('#denominationList');
  if(!list) return;
  list.innerHTML = denominationsV6.map(v=>`<div class="denomination-row"><span class="denomination-value">C$ ${v}</span><input type="number" min="0" step="1" value="0" data-value="${v}" oninput="calculateBreakdownTotal()"><strong class="denomination-subtotal">C$ 0</strong></div>`).join('');
  $('#cashBreakdownModal').classList.remove('hidden');
  calculateBreakdownTotal();
};
window.calculateBreakdownTotal = function(){
  let total=0;
  document.querySelectorAll('#denominationList input').forEach(input=>{
    const subtotal = Number(input.dataset.value)*Number(input.value||0);
    input.closest('.denomination-row').querySelector('.denomination-subtotal').textContent = money(subtotal);
    total += subtotal;
  });
  $('#breakdownTotal').textContent = money(total);
};
window.applyCashBreakdown = function(){
  const txt = $('#breakdownTotal').textContent.replace('C$','').replaceAll(',','').trim();
  $('#countedCash').value = Math.ceil(Number(txt||0));
  updateClosingCashSummaryV84();
  closeCashBreakdown();
};
window.closeCashBreakdown = function(){ $('#cashBreakdownModal').classList.add('hidden'); };
closeCash = async function(){
  const id=$('#closeCashSession').value; if(!id) return alert('No hay caja abierta para cerrar.');
  const session = cashSessions.find(s=>String(s.id)===String(id)) || {};
  const summary=cashSessionSalesV83(id);
  const countedCash=Number($('#countedCash')?.value||0);
  const countedCashUsd=Number($('#countedCashUsd')?.value||0);
  const countedCard=Number($('#countedCard')?.value||0);
  const countedTransfer=Number($('#countedTransfer')?.value||0);
  const expenses=Number($('#cashExpenses')?.value||0);
  const tempSession={...session,cash_expenses:expenses};
  const expectedCash=expectedCashNioV83(tempSession);
  const expectedCashUsd=Number(session.opening_cash_usd||0);
  const expectedCard=summary.card;
  const expectedTransfer=summary.transfer;
  const diffCash=countedCash-expectedCash;
  const diffUsd=countedCashUsd-expectedCashUsd;
  const diffCard=countedCard-expectedCard;
  const diffTransfer=countedTransfer-expectedTransfer;
  const countedTotal=countedCash+countedCard+countedTransfer;
  const expectedTotal=expectedCash+expectedCard+expectedTransfer;
  const diffTotal=diffCash+diffCard+diffTransfer;
  if((diffTotal!==0 || diffUsd!==0) && !($('#closingNote')?.value||'').trim()) return alert('Hay diferencia. Debes registrar una observación antes de cerrar caja. El dinero no desaparece con poesía.');
  const payload={status:'CLOSED',closed_at:new Date().toISOString(),expected_cash:expectedCash,expected_total:expectedTotal,counted_cash:countedCash,counted_card:countedCard,counted_transfer:countedTransfer,cash_expenses:expenses,counted_total:countedTotal,difference_amount:diffTotal,opening_cash_nio:Number(session.opening_cash_nio||session.opening_amount||0),opening_cash_usd:expectedCashUsd,expected_cash_nio:expectedCash,expected_cash_usd:expectedCashUsd,counted_cash_nio:countedCash,counted_cash_usd:countedCashUsd,difference_cash_nio:diffCash,difference_cash_usd:diffUsd,closing_note:$('#closingNote')?.value||null};
  const r=await sb.from('cash_sessions').update(payload).eq('id',id);
  if(r.error) return alert(r.error.message);
  await loadAll();
};
function updateClosingCashSummaryV84(){
  const box=$('#closingCashSummary'); if(!box) return;
  const id=$('#closeCashSession')?.value; const s=(cashSessions||[]).find(x=>String(x.id)===String(id));
  if(!s){ box.innerHTML='<div class="closing-summary-title">Cuadre automático</div><div class="closing-summary-empty">Selecciona una caja abierta para calcular el cuadre.</div>'; return; }
  const summary=cashSessionSalesV83(s.id);
  const expenses=Number($('#cashExpenses')?.value||0);
  const tmp={...s,cash_expenses:expenses};
  const expectedCash=expectedCashNioV83(tmp);
  const expectedUsd=Number(s.opening_cash_usd||0);
  const countedCash=Number($('#countedCash')?.value||0);
  const countedUsd=Number($('#countedCashUsd')?.value||0);
  const countedCard=Number($('#countedCard')?.value||0);
  const countedTransfer=Number($('#countedTransfer')?.value||0);
  const diffCash=countedCash-expectedCash;
  const diffUsd=countedUsd-expectedUsd;
  const diffCard=countedCard-summary.card;
  const diffTransfer=countedTransfer-summary.transfer;
  const diffTotal=diffCash+diffCard+diffTransfer;
  box.innerHTML=`<div class="closing-summary-title">Cuadre automático</div>
    <div class="closing-summary-grid">
      <div><span>Vendido total</span><strong>${money(summary.total)}</strong></div>
      <div><span>Efectivo esperado C$</span><strong>${money(expectedCash)}</strong></div>
      <div><span>Efectivo contado C$</span><strong>${money(countedCash)}</strong></div>
      <div class="${diffClassV6(diffCash)}"><span>Diferencia efectivo C$</span><strong>${diffLabelV6(diffCash)}</strong></div>
      <div><span>Tarjeta esperado/contado</span><strong>${money(summary.card)} / ${money(countedCard)}</strong></div>
      <div class="${diffClassV6(diffCard)}"><span>Diferencia tarjeta</span><strong>${diffLabelV6(diffCard)}</strong></div>
      <div><span>Transferencia esperado/contado</span><strong>${money(summary.transfer)} / ${money(countedTransfer)}</strong></div>
      <div class="${diffClassV6(diffTransfer)}"><span>Diferencia transferencia</span><strong>${diffLabelV6(diffTransfer)}</strong></div>
      <div><span>US$ esperado/contado</span><strong>${usdMoneyV82(expectedUsd)} / ${usdMoneyV82(countedUsd)}</strong></div>
      <div class="${diffClassV6(diffUsd)}"><span>Diferencia US$</span><strong>${diffUsd===0?'Cuadrado':(diffUsd<0?'Faltante ':'Sobrante ')+usdMoneyV82(Math.abs(diffUsd))}</strong></div>
      <div class="closing-summary-total ${diffClassV6(diffTotal)}"><span>Diferencia total C$</span><strong>${diffLabelV6(diffTotal)}</strong></div>
    </div>`;
}
['closeCashSession','countedCash','countedCashUsd','countedCard','countedTransfer','cashExpenses'].forEach(id=>{
  const el=$('#'+id); if(el) el.addEventListener('input',updateClosingCashSummaryV84);
  if(el) el.addEventListener('change',updateClosingCashSummaryV84);
});

function diffClassV6(v){v=Number(v||0); if(v<0) return 'difference-negative'; if(v>0) return 'difference-positive'; return 'difference-ok'}
function diffLabelV6(v){v=Number(v||0); if(v<0) return `Faltante ${money(Math.abs(v))}`; if(v>0) return `Sobrante ${money(v)}`; return 'Cuadrado'}
renderCash = function(){
  $('#cashTable').innerHTML='<tr><th>Caja</th><th>Cajero</th><th>Apertura</th><th>Estado</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Acciones</th></tr>'+cashSessions.map(s=>`<tr><td>${escapeHtmlV6(s.box_name||'Caja')}</td><td>${escapeHtmlV6(s.cashier_name||'')}</td><td>${new Date(s.opened_at||Date.now()).toLocaleString()}</td><td><span class="status-pill ${s.status==='OPEN'?'status-open':'status-closed'}">${s.status==='OPEN'?'Abierta':'Cerrada'}</span></td><td>${money(s.expected_total||s.opening_amount||0)}</td><td>${money(s.counted_total||0)}</td><td><span class="difference-pill ${diffClassV6(s.difference_amount)}">${diffLabelV6(s.difference_amount)}</span></td><td class="cash-actions"><button onclick="viewClosingTicketV6('${s.id}')">Ver ticket</button><button onclick="printClosingAuditV6('${s.id}')">Imprimir</button></td></tr>`).join('');
};
function usdMoneyV82(v){ return 'US$ ' + Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function cashStatusLabelV82(s){ return s.status==='OPEN'?'Abierta':'Cerrada'; }
window.viewClosingTicketV6=function(id){
  const s=cashSessions.find(x=>x.id===id); if(!s)return;
  const openingNio=Number(s.opening_cash_nio ?? s.opening_amount ?? 0);
  const openingUsd=Number(s.opening_cash_usd ?? 0);
  const expectedNio=Number(s.expected_cash_nio ?? s.expected_cash ?? s.expected_total ?? openingNio);
  const expectedUsd=Number(s.expected_cash_usd ?? openingUsd);
  const countedNio=Number(s.counted_cash_nio ?? s.counted_cash ?? s.counted_total ?? 0);
  const countedUsd=Number(s.counted_cash_usd ?? 0);
  const diffNio=Number(s.difference_cash_nio ?? s.difference_amount ?? 0);
  const diffUsd=Number(s.difference_cash_usd ?? (countedUsd-expectedUsd));
  $('#ticket80').innerHTML=`
  <div class="cash-ticket-readable">
    <div class="cash-ticket-title">CIERRE DE CAJA</div>
    <div class="cash-ticket-subtitle">${cashDateLabelV81(s.opened_at)}</div>

    <div class="cash-ticket-section">
      <div class="ticket-info-row"><span>Caja</span><strong>${escapeHtmlV6(s.box_name||'Caja')}</strong></div>
      <div class="ticket-info-row"><span>Cajero</span><strong>${escapeHtmlV6(s.cashier_name||'')}</strong></div>
      <div class="ticket-info-row"><span>Apertura</span><strong>${cashTimeLabelV81(s.opened_at)}</strong></div>
      <div class="ticket-info-row"><span>Cierre</span><strong>${s.closed_at?cashTimeLabelV81(s.closed_at):'Pendiente'}</strong></div>
      <div class="ticket-info-row"><span>Duración</span><strong>${cashDurationV81(s.opened_at,s.closed_at)}</strong></div>
      <div class="ticket-info-row"><span>Estado</span><strong>${cashStatusLabelV82(s)}</strong></div>
    </div>

    <div class="cash-ticket-section">
      <div class="cash-ticket-heading">Fondo inicial</div>
      <div class="ticket-info-row"><span>Córdobas</span><strong>${money(openingNio)}</strong></div>
      <div class="ticket-info-row"><span>Dólares</span><strong>${usdMoneyV82(openingUsd)}</strong></div>
    </div>

    <div class="cash-ticket-section two-cols">
      <div class="ticket-box"><span>Esperado C$</span><strong>${money(expectedNio)}</strong></div>
      <div class="ticket-box"><span>Contado C$</span><strong>${money(countedNio)}</strong></div>
      <div class="ticket-box"><span>Esperado US$</span><strong>${usdMoneyV82(expectedUsd)}</strong></div>
      <div class="ticket-box"><span>Contado US$</span><strong>${usdMoneyV82(countedUsd)}</strong></div>
    </div>

    <div class="cash-ticket-section">
      <div class="ticket-info-row diff ${diffNio<0?'bad':diffNio>0?'warn':'ok'}"><span>Diferencia C$</span><strong>${diffLabelV6(diffNio)}</strong></div>
      <div class="ticket-info-row diff ${diffUsd<0?'bad':diffUsd>0?'warn':'ok'}"><span>Diferencia US$</span><strong>${diffUsd===0?'Cuadrado':(diffUsd<0?'Faltante ':'Sobrante ')+usdMoneyV82(Math.abs(diffUsd))}</strong></div>
    </div>

    <div class="cash-ticket-note"><span>Observación</span><p>${escapeHtmlV6(s.closing_note||'Sin observación')}</p></div>
  </div>`;
  $('#ticketModal').classList.remove('hidden');
};
window.printClosingAuditV6=function(id){viewClosingTicketV6(id); setTimeout(()=>printTicket(),150)};
const bindBaseV81 = bind;
bind = function(){
  bindBaseV81();
  ['cashFilterDate','cashFilterBox','cashFilterStatus'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=renderCash; });
  if($('#cashClearFilters')) $('#cashClearFilters').onclick=()=>{ if($('#cashFilterDate')) $('#cashFilterDate').value=''; if($('#cashFilterBox')) $('#cashFilterBox').value='ALL'; if($('#cashFilterStatus')) $('#cashFilterStatus').value='ALL'; renderCash(); };
  if($('#activeCashBox')) $('#activeCashBox').onchange=()=>{localStorage.setItem('mm_cash_session',$('#activeCashBox').value);renderCashOperationalBannerV81();};
};

// Reaplicar enlaces para que V8.1 tome control después de cargar los overrides.
bind();
applyRole();


/* ==========================================================
   V8.3 FIX - Tickets de caja y arqueo automático
   Corrige botones Ver ticket / Imprimir y agrega resumen real
   de ventas por método de pago para cada sesión de caja.
   ========================================================== */
function pad2V83(n){return String(n).padStart(2,'0')}
function safeDateV83(value){const d=value?new Date(value):new Date(); return isNaN(d.getTime())?new Date():d}
function cashDateLabelV81(value){
  const d=safeDateV83(value);
  return d.toLocaleDateString('es-NI',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
}
function cashShortDateV83(value){
  const d=safeDateV83(value);
  return `${pad2V83(d.getDate())}/${pad2V83(d.getMonth()+1)}/${d.getFullYear()}`;
}
function cashTimeLabelV81(value){
  const d=safeDateV83(value);
  return d.toLocaleTimeString('es-NI',{hour:'2-digit',minute:'2-digit'});
}
function cashDurationV81(start,end){
  if(!start) return 'Pendiente';
  const a=safeDateV83(start).getTime();
  const b=end?safeDateV83(end).getTime():Date.now();
  const mins=Math.max(0,Math.floor((b-a)/60000));
  const h=Math.floor(mins/60), m=mins%60;
  return h?`${h}h ${m}m`:`${m}m`;
}
function cashSessionSalesV83(sessionId){
  const related=(sales||[]).filter(s=>String(s.cash_session_id||'')===String(sessionId));
  const byMethod=(method)=>related.filter(s=>String(s.payment_method||'').toUpperCase()===method).reduce((a,s)=>a+Number(s.total||0),0);
  const change=related.reduce((a,s)=>a+Number(s.change_amount||0),0);
  return {
    count: related.length,
    total: related.reduce((a,s)=>a+Number(s.total||0),0),
    cashNio: byMethod('EFECTIVO'),
    card: byMethod('TARJETA'),
    transfer: byMethod('TRANSFERENCIA'),
    mixed: byMethod('MIXTO'),
    changeNio: change,
  };
}
function expectedCashNioV83(s){
  const summary=cashSessionSalesV83(s.id);
  const opening=Number(s.opening_cash_nio ?? s.opening_amount ?? 0);
  const expenses=Number(s.cash_expenses ?? 0);
  const stored=s.expected_cash_nio ?? s.expected_cash;
  if(String(s.status||'').toUpperCase()==='CLOSED' && stored!==undefined && stored!==null) return Number(stored);
  return opening + summary.cashNio + summary.mixed - summary.changeNio - expenses;
}
function expectedTotalNioV83(s){
  const summary=cashSessionSalesV83(s.id);
  const stored=s.expected_total;
  if(String(s.status||'').toUpperCase()==='CLOSED' && stored!==undefined && stored!==null) return Number(stored);
  return expectedCashNioV83(s)+summary.card+summary.transfer;
}
function populateCashFilterBoxesV83(){
  const sel=$('#cashFilterBox');
  if(!sel) return;
  const current=sel.value||'ALL';
  const names=[...new Set((cashSessions||[]).map(s=>s.box_name||'Caja'))].sort();
  sel.innerHTML='<option value="ALL">Todas</option>'+names.map(n=>`<option value="${escapeHtmlV6(n)}">${escapeHtmlV6(n)}</option>`).join('');
  sel.value=[...sel.options].some(o=>o.value===current)?current:'ALL';
}
function renderCashOperationalBannerV81(){
  const el=$('#cashOperationalBanner'); if(!el) return;
  const id=$('#activeCashBox')?.value || $('#closeCashSession')?.value || '';
  const s=(cashSessions||[]).find(x=>String(x.id)===String(id));
  if(!s){el.textContent='Sin caja abierta seleccionada'; return;}
  const summary=cashSessionSalesV83(s.id);
  el.innerHTML=`<strong>${escapeHtmlV6(s.box_name||'Caja')}</strong> · ${escapeHtmlV6(s.cashier_name||'Cajero')} · ${cashShortDateV83(s.opened_at)} · Apertura ${cashTimeLabelV81(s.opened_at)} · Ventas ${money(summary.total)}`;
}
function filteredCashSessionsV83(){
  const date=$('#cashFilterDate')?.value || '';
  const box=$('#cashFilterBox')?.value || 'ALL';
  const status=$('#cashFilterStatus')?.value || 'ALL';
  return (cashSessions||[]).filter(s=>{
    const okDate=!date || (s.opened_at||'').slice(0,10)===date;
    const okBox=box==='ALL' || String(s.box_name||'Caja')===String(box);
    const okStatus=status==='ALL' || String(s.status||'')===status;
    return okDate && okBox && okStatus;
  });
}
renderCash=function(){
  populateCashFilterBoxesV83();
  renderCashOperationalBannerV81();
  updateClosingCashSummaryV84();
  const rows=filteredCashSessionsV83();
  const table=$('#cashTable'); if(!table) return;
  table.innerHTML='<tr><th>Fecha</th><th>Caja</th><th>Cajero</th><th>Apertura</th><th>Cierre</th><th>Duración</th><th>Estado</th><th>Vendido</th><th>Esperado C$</th><th>Contado C$</th><th>Diferencia</th><th>Acciones</th></tr>'+
    rows.map(s=>{
      const summary=cashSessionSalesV83(s.id);
      const expected=expectedCashNioV83(s);
      const counted=Number(s.counted_cash_nio ?? s.counted_cash ?? s.counted_total ?? 0);
      const diff=Number(s.difference_cash_nio ?? s.difference_amount ?? (counted-expected));
      return `<tr>
        <td>${cashShortDateV83(s.opened_at)}</td>
        <td>${escapeHtmlV6(s.box_name||'Caja')}</td>
        <td>${escapeHtmlV6(s.cashier_name||'')}</td>
        <td>${cashTimeLabelV81(s.opened_at)}</td>
        <td>${s.closed_at?cashTimeLabelV81(s.closed_at):'Pendiente'}</td>
        <td>${cashDurationV81(s.opened_at,s.closed_at)}</td>
        <td><span class="status-pill ${s.status==='OPEN'?'status-open':'status-closed'}">${s.status==='OPEN'?'Abierta':'Cerrada'}</span></td>
        <td>${money(summary.total)}</td>
        <td>${money(expected)}</td>
        <td>${money(counted)}</td>
        <td><span class="difference-pill ${diffClassV6(diff)}">${diffLabelV6(diff)}</span></td>
        <td class="cash-actions"><button type="button" onclick="viewClosingTicketV6('${s.id}')">Ver ticket</button><button type="button" onclick="printClosingAuditV6('${s.id}')">Imprimir</button></td>
      </tr>`;
    }).join('');
};
window.viewClosingTicketV6=function(id){
  const s=(cashSessions||[]).find(x=>String(x.id)===String(id));
  if(!s){ alert('No encontré la sesión de caja para generar el ticket.'); return; }
  const summary=cashSessionSalesV83(s.id);
  const openingNio=Number(s.opening_cash_nio ?? s.opening_amount ?? 0);
  const openingUsd=Number(s.opening_cash_usd ?? 0);
  const expenses=Number(s.cash_expenses ?? 0);
  const expectedNio=expectedCashNioV83(s);
  const expectedUsd=Number(s.expected_cash_usd ?? s.opening_cash_usd ?? 0);
  const countedNio=Number(s.counted_cash_nio ?? s.counted_cash ?? s.counted_total ?? 0);
  const countedUsd=Number(s.counted_cash_usd ?? 0);
  const diffNio=Number(s.difference_cash_nio ?? s.difference_amount ?? (countedNio-expectedNio));
  const diffUsd=Number(s.difference_cash_usd ?? (countedUsd-expectedUsd));
  $('#ticket80').innerHTML=`
  <div class="cash-ticket-readable">
    <div class="cash-ticket-title">MM FERRETERÍA</div>
    <div class="cash-ticket-subtitle">CIERRE DE CAJA · ${cashDateLabelV81(s.opened_at)}</div>

    <div class="cash-ticket-section">
      <div class="ticket-info-row"><span>Caja</span><strong>${escapeHtmlV6(s.box_name||'Caja')}</strong></div>
      <div class="ticket-info-row"><span>Cajero</span><strong>${escapeHtmlV6(s.cashier_name||'')}</strong></div>
      <div class="ticket-info-row"><span>Apertura</span><strong>${cashTimeLabelV81(s.opened_at)}</strong></div>
      <div class="ticket-info-row"><span>Cierre</span><strong>${s.closed_at?cashTimeLabelV81(s.closed_at):'Pendiente'}</strong></div>
      <div class="ticket-info-row"><span>Duración</span><strong>${cashDurationV81(s.opened_at,s.closed_at)}</strong></div>
      <div class="ticket-info-row"><span>Estado</span><strong>${s.status==='OPEN'?'Abierta':'Cerrada'}</strong></div>
    </div>

    <div class="cash-ticket-section">
      <div class="cash-ticket-heading">Ventas del turno</div>
      <div class="ticket-info-row"><span>No. ventas</span><strong>${summary.count}</strong></div>
      <div class="ticket-info-row"><span>Efectivo C$</span><strong>${money(summary.cashNio)}</strong></div>
      <div class="ticket-info-row"><span>Tarjeta</span><strong>${money(summary.card)}</strong></div>
      <div class="ticket-info-row"><span>Transferencia</span><strong>${money(summary.transfer)}</strong></div>
      <div class="ticket-info-row"><span>Mixto</span><strong>${money(summary.mixed)}</strong></div>
      <div class="ticket-info-row"><span>Total vendido</span><strong>${money(summary.total)}</strong></div>
      <div class="ticket-info-row"><span>Cambio entregado</span><strong>${money(summary.changeNio)}</strong></div>
    </div>

    <div class="cash-ticket-section">
      <div class="cash-ticket-heading">Arqueo</div>
      <div class="ticket-info-row"><span>Fondo inicial C$</span><strong>${money(openingNio)}</strong></div>
      <div class="ticket-info-row"><span>Fondo inicial US$</span><strong>${usdMoneyV82(openingUsd)}</strong></div>
      <div class="ticket-info-row"><span>Salidas / gastos</span><strong>${money(expenses)}</strong></div>
    </div>

    <div class="cash-ticket-section two-cols">
      <div class="ticket-box"><span>Esperado C$</span><strong>${money(expectedNio)}</strong></div>
      <div class="ticket-box"><span>Contado C$</span><strong>${money(countedNio)}</strong></div>
      <div class="ticket-box"><span>Esperado US$</span><strong>${usdMoneyV82(expectedUsd)}</strong></div>
      <div class="ticket-box"><span>Contado US$</span><strong>${usdMoneyV82(countedUsd)}</strong></div>
    </div>

    <div class="cash-ticket-section">
      <div class="ticket-info-row diff ${diffNio<0?'bad':diffNio>0?'warn':'ok'}"><span>Diferencia C$</span><strong>${diffLabelV6(diffNio)}</strong></div>
      <div class="ticket-info-row diff ${diffUsd<0?'bad':diffUsd>0?'warn':'ok'}"><span>Diferencia US$</span><strong>${diffUsd===0?'Cuadrado':(diffUsd<0?'Faltante ':'Sobrante ')+usdMoneyV82(Math.abs(diffUsd))}</strong></div>
    </div>

    <div class="cash-ticket-note"><span>Observación</span><p>${escapeHtmlV6(s.closing_note||'Sin observación')}</p></div>
    <div class="cash-ticket-section signature-lines"><div>Firma cajero: __________________</div><div>Firma supervisor: ______________</div></div>
  </div>`;
  $('#ticketModal').classList.remove('hidden');
};
window.printTicket=function(){
  const modal=$('#ticketModal');
  if(modal?.classList.contains('hidden')) return alert('Primero genera el ticket. Qué concepto tan revolucionario.');
  window.print();
};
window.closeTicket=function(){ $('#ticketModal')?.classList.add('hidden'); };
window.printClosingAuditV6=function(id){
  viewClosingTicketV6(id);
  setTimeout(()=>window.printTicket(),250);
};


/* ===============================
   V8.5 - Cierre con detalle de ventas
   Muestra caja chica/fondo inicial, ventas del turno y productos vendidos
   antes de cerrar la caja. Porque cerrar caja a ciegas es contabilidad por fe.
================================ */
function paymentLabelV85(method){
  const m=String(method||'').toUpperCase();
  if(m==='EFECTIVO') return 'Efectivo';
  if(m==='TARJETA') return 'Tarjeta';
  if(m==='TRANSFERENCIA') return 'Transferencia';
  if(m==='MIXTO') return 'Mixto';
  return method||'No definido';
}
function cashSessionSalesDetailedV85(sessionId){
  const sessionSales=(sales||[]).filter(s=>String(s.cash_session_id||'')===String(sessionId));
  const ids=new Set(sessionSales.map(s=>String(s.id)));
  const items=(saleItems||[]).filter(i=>ids.has(String(i.sale_id)));
  return {sales:sessionSales,items};
}
function renderClosingSessionDetailV85(){
  const box=$('#closingSessionDetail'); if(!box) return;
  const id=$('#closeCashSession')?.value;
  const s=(cashSessions||[]).find(x=>String(x.id)===String(id));
  if(!s){
    box.innerHTML='<div class="closing-detail-empty">Selecciona una caja abierta para ver apertura, caja chica y detalle de ventas.</div>';
    return;
  }
  const summary=cashSessionSalesV83(s.id);
  const detail=cashSessionSalesDetailedV85(s.id);
  const openingNio=Number(s.opening_cash_nio ?? s.opening_amount ?? 0);
  const openingUsd=Number(s.opening_cash_usd ?? 0);
  const expenses=Number($('#cashExpenses')?.value||s.cash_expenses||0);
  const expectedCash=expectedCashNioV83({...s,cash_expenses:expenses});
  const salesRows=detail.sales.slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)).map(v=>`
    <tr>
      <td>${cashTimeLabelV81(v.created_at)}</td>
      <td>${escapeHtmlV6(v.invoice_no||'Ticket')}</td>
      <td>${paymentLabelV85(v.payment_method)}</td>
      <td>${money(v.total||0)}</td>
      <td>${money(v.amount_received||0)}</td>
      <td>${money(v.change_amount||0)}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted-row">No hay ventas registradas en esta caja.</td></tr>';
  const itemRows=detail.items.slice(0,12).map(i=>`
    <tr>
      <td>${escapeHtmlV6(i.product_code||'')}</td>
      <td>${escapeHtmlV6(i.product_name||'Producto')}</td>
      <td>${Number(i.quantity||0)}</td>
      <td>${money(i.unit_price||0)}</td>
      <td>${money(i.total||0)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted-row">No hay detalle de productos para esta caja.</td></tr>';
  const extraItems=detail.items.length>12 ? `<div class="closing-detail-note">Mostrando 12 de ${detail.items.length} productos vendidos. El ticket de cierre conserva el resumen general.</div>` : '';
  box.innerHTML=`
    <div class="closing-detail-header">
      <div>
        <span>Caja chica / fondo inicial C$</span>
        <strong>${money(openingNio)}</strong>
      </div>
      <div>
        <span>Fondo inicial US$</span>
        <strong>${usdMoneyV82(openingUsd)}</strong>
      </div>
      <div>
        <span>Apertura</span>
        <strong>${cashShortDateV83(s.opened_at)} ${cashTimeLabelV81(s.opened_at)}</strong>
      </div>
      <div>
        <span>Cajero</span>
        <strong>${escapeHtmlV6(s.cashier_name||'')}</strong>
      </div>
    </div>
    <div class="closing-detail-kpis">
      <div><span>Vendido total</span><strong>${money(summary.total)}</strong></div>
      <div><span>Efectivo C$</span><strong>${money(summary.cashNio)}</strong></div>
      <div><span>Tarjeta</span><strong>${money(summary.card)}</strong></div>
      <div><span>Transferencia</span><strong>${money(summary.transfer)}</strong></div>
      <div><span>Cambio entregado</span><strong>${money(summary.changeNio)}</strong></div>
      <div><span>Esperado en caja C$</span><strong>${money(expectedCash)}</strong></div>
    </div>
    <details class="closing-sales-detail" open>
      <summary>Ventas del turno (${detail.sales.length})</summary>
      <div class="mini-table-wrap"><table class="mini-table"><tr><th>Hora</th><th>Ticket</th><th>Pago</th><th>Total</th><th>Recibido</th><th>Cambio</th></tr>${salesRows}</table></div>
    </details>
    <details class="closing-sales-detail" open>
      <summary>Productos vendidos (${detail.items.length})</summary>
      <div class="mini-table-wrap"><table class="mini-table"><tr><th>Código</th><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr>${itemRows}</table></div>
      ${extraItems}
    </details>`;
}
const updateClosingCashSummaryV84_Base = updateClosingCashSummaryV84;
updateClosingCashSummaryV84 = function(){
  updateClosingCashSummaryV84_Base();
  renderClosingSessionDetailV85();
};
const renderCashV84_Base = renderCash;
renderCash = function(){
  renderCashV84_Base();
  renderClosingSessionDetailV85();
};
const viewClosingTicketV6_Base = window.viewClosingTicketV6;
window.viewClosingTicketV6=function(id){
  viewClosingTicketV6_Base(id);
  const s=(cashSessions||[]).find(x=>String(x.id)===String(id));
  if(!s || !$('#ticket80')) return;
  const detail=cashSessionSalesDetailedV85(id);
  const productLines=detail.items.slice(0,10).map(i=>`<div class="ticket-info-row"><span>${escapeHtmlV6(i.product_name||'Producto')} x ${Number(i.quantity||0)}</span><strong>${money(i.total||0)}</strong></div>`).join('');
  const block=`<div class="cash-ticket-section"><div class="cash-ticket-heading">Productos vendidos</div>${productLines || '<div class="ticket-info-row"><span>Sin productos registrados</span><strong>0</strong></div>'}${detail.items.length>10?`<div class="cash-ticket-small">+ ${detail.items.length-10} productos adicionales</div>`:''}</div>`;
  const current=$('#ticket80').innerHTML;
  $('#ticket80').innerHTML=current.replace('<div class="cash-ticket-section signature-lines">', block+'<div class="cash-ticket-section signature-lines">');
};
['closeCashSession','cashExpenses'].forEach(id=>{
  const el=$('#'+id); if(el){ el.addEventListener('change',renderClosingSessionDetailV85); el.addEventListener('input',renderClosingSessionDetailV85); }
});

const bindBaseV83=bind;
bind=function(){
  bindBaseV83();
  ['cashFilterDate','cashFilterBox','cashFilterStatus'].forEach(id=>{const el=$('#'+id); if(el) el.onchange=renderCash;});
  if($('#cashClearFilters')) $('#cashClearFilters').onclick=()=>{ if($('#cashFilterDate')) $('#cashFilterDate').value=''; if($('#cashFilterBox')) $('#cashFilterBox').value='ALL'; if($('#cashFilterStatus')) $('#cashFilterStatus').value='ALL'; renderCash(); };
  if($('#activeCashBox')) $('#activeCashBox').onchange=()=>{localStorage.setItem('mm_cash_session',$('#activeCashBox').value);renderCashOperationalBannerV81();};
  if($('#closeCashSession')) $('#closeCashSession').onchange=renderCashOperationalBannerV81;
};
bind();
applyRole();
renderCash();

/* ==========================================================
   V9 - Inventario profesional + códigos de barra reales
   - SKU automático por categoría: MM-HER-000001
   - Barcode = SKU interno en Code 128
   - Búsqueda inteligente por SKU, barcode, código fabricante/proveedor,
     nombre, marca, categoría y alias/sinónimos.
   - Etiquetas 50x30 / 70x40 / hoja con JsBarcode real.
   ========================================================== */
const CATEGORY_PREFIX_V9 = {
  'HERRAMIENTAS':'HER','HERRAMIENTA':'HER','TOOLS':'HER',
  'PLOMERIA':'PLO','PLOMERÍA':'PLO','FONTANERIA':'PLO','FONTANERÍA':'PLO',
  'ELECTRICO':'ELE','ELÉCTRICO':'ELE','ELECTRICIDAD':'ELE','ELECTRICA':'ELE','ELÉCTRICA':'ELE',
  'PINTURA':'PIN','PINTURAS':'PIN',
  'FIJACION':'FIJ','FIJACIÓN':'FIJ','CERRAJERIA':'FIJ','CERRAJERÍA':'FIJ','FIJACIÓN Y CERRAJERÍA':'FIJ',
  'SEGURIDAD':'SEG','SEGURIDAD INDUSTRIAL':'SEG',
  'GENERAL':'GEN'
};
function normalizeV9(v=''){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
}
function categoryPrefixV9(categoryId){
  const c=(categories||[]).find(x=>String(x.id)===String(categoryId));
  const raw=normalizeV9(c?.code || c?.name || 'GENERAL');
  if(CATEGORY_PREFIX_V9[raw]) return CATEGORY_PREFIX_V9[raw];
  const hit=Object.keys(CATEGORY_PREFIX_V9).find(k=>raw.includes(normalizeV9(k)));
  return hit ? CATEGORY_PREFIX_V9[hit] : (raw.replace(/[^A-Z]/g,'').slice(0,3)||'GEN').padEnd(3,'X');
}
function nextSkuV9(categoryId){
  const pref=categoryPrefixV9(categoryId);
  const re=new RegExp(`^MM-${pref}-(\\d{6})$`,'i');
  const max=(products||[]).reduce((m,p)=>{
    const match=String(p.internal_code||p.barcode||'').match(re);
    return match ? Math.max(m, Number(match[1]||0)) : m;
  },0);
  return `MM-${pref}-${String(max+1).padStart(6,'0')}`;
}
function productSearchTextV9(p){
  const cat=p.categories?.name || (categories||[]).find(c=>String(c.id)===String(p.category_id))?.name || '';
  return [p.internal_code,p.barcode,p.supplier_code,p.manufacturer_code,p.name,p.clean_name,p.brand,p.model,p.location,p.synonyms,cat].join(' ').toLowerCase();
}
function labelFormatClassV9(){
  const f=$('#labelFormat')?.value || 'thermal_50x30';
  if(f==='shelf_70x40') return 'label-70x40';
  if(f==='sheet_a4') return 'sheet-a4-label';
  return 'label-50x30';
}
function shortProductNameV9(name){
  return String(name||'Producto').replace(/\s+/g,' ').trim().slice(0,58);
}
function selectedProductForLabelV9(){
  const q=($('#barcodeSearch')?.value||'').toLowerCase().trim();
  return (products||[]).find(p=>!q || productSearchTextV9(p).includes(q)) || (products||[])[0];
}
renderLabels=function(){
  const container=$('#labelPreview'); if(!container) return;
  const qty=Math.max(1,Math.min(200,Number($('#labelQty')?.value||1)));
  const p=selectedProductForLabelV9();
  if(!p){container.innerHTML='<div class="label-empty">No hay productos para generar etiqueta.</div>'; return;}
  const code=String(p.barcode||p.internal_code||nextSkuV9(p.category_id));
  const cls=labelFormatClassV9();
  container.innerHTML=Array(qty).fill(0).map((_,i)=>`
    <div class="thermal-label ${cls}" data-barcode="${escapeHtmlV6(code)}">
      <div class="label-name">${escapeHtmlV6(shortProductNameV9(p.name))}</div>
      <div class="barcode-wrap"><svg class="barcode-svg" id="barcode_${i}"></svg></div>
      <div class="label-footer">
        <span class="label-sku">${escapeHtmlV6(code)}</span>
        <span class="label-price">${money(p.sale_price)}</span>
      </div>
    </div>`).join('');
  if(window.JsBarcode){
    container.querySelectorAll('.barcode-svg').forEach(svg=>{
      try{
        JsBarcode(svg, code, {format:'CODE128', displayValue:false, margin:0, height:34, width:1.25});
      }catch(e){
        svg.outerHTML='<div class="barcode-error">Código inválido</div>';
      }
    });
  }
};
function printLabelsV9(){
  renderLabels();
  document.body.classList.add('printing-labels');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('printing-labels'),600);
  },120);
}
filteredProductsForPOS=function(){
  const q=($('#posSearch')?.value||'').toLowerCase().trim();
  return (products||[]).filter(p=>{
    const cat=p.categories?.name||'';
    const byCat=selectedCategory==='ALL'||cat===selectedCategory;
    return byCat && (!q || productSearchTextV9(p).includes(q));
  }).slice(0,80);
};
renderProducts=function(){
  const q=($('#productSearch')?.value||'').toLowerCase().trim();
  const rows=(products||[]).filter(p=>!q || productSearchTextV9(p).includes(q)).slice(0,180);
  $('#productsTable').innerHTML='<tr><th>SKU / Barcode</th><th>Producto</th><th>Costo</th><th>Margen</th><th>Venta</th><th>Stock</th><th>Ubicación</th><th></th></tr>'+rows.map(p=>`<tr>
    <td><strong>${escapeHtmlV6(p.internal_code||'')}</strong><br><small>${escapeHtmlV6(p.barcode||p.internal_code||'')}</small></td>
    <td>${escapeHtmlV6(p.name)}<br><span class="tag">${escapeHtmlV6(p.categories?.name||'General')}</span>${p.brand?` <small>${escapeHtmlV6(p.brand)}</small>`:''}</td>
    <td>${money(p.purchase_price)}</td><td>${Number(p.profit_margin||35)}%</td><td><b>${money(p.sale_price)}</b></td>
    <td>${p.stock}</td><td>${escapeHtmlV6(p.location||'')}</td>
    <td><button class="adminOnly ${!isAdmin()?'adminLocked':''}" onclick="editProduct('${p.id}')">Editar</button></td>
  </tr>`).join('');
};
const saveProductV9Base = saveProduct;
saveProduct = async function(e){
  e.preventDefault();
  if(!guardAdmin()) return;
  const m=$('#profitMargin').value;
  const manual=m==='manual';
  const cost=Number($('#purchasePrice').value||0);
  const sale=manual?Number($('#salePrice').value||0):Math.ceil(cost*(1+Number(m)/100));
  const categoryId=$('#categorySelect').value||null;
  const payload={
    supplier_code:$('#supplierCode').value||null,
    name:$('#productName').value,
    category_id:categoryId,
    brand:$('#brand').value||null,
    unit_type:$('#unitType').value,
    purchase_price:cost,
    profit_margin:manual?0:Number(m),
    allow_manual_price:manual,
    sale_price:sale,
    stock:Number($('#stock').value||0),
    min_stock:Number($('#minStock').value||0),
    max_stock:Number($('#maxStock').value||0),
    location:$('#location').value||null,
    last_cost_update:new Date().toISOString()
  };
  let r;
  if($('#productId').value){
    r=await sb.from('products').update(payload).eq('id',$('#productId').value);
  }else{
    const code=nextSkuV9(categoryId);
    r=await sb.from('products').insert({...payload,internal_code:code,barcode:code,status:'ACTIVE'});
  }
  if(r.error) return alert(r.error.message);
  resetProductForm();
  await loadAll();
};
function insertInventoryAlertsV9(){
  const dash=$('#dashboard');
  if(!dash || $('#inventoryAlertsV9')) return;
  const div=document.createElement('div');
  div.id='inventoryAlertsV9';
  div.className='panel inventory-alerts';
  div.innerHTML='<h3>Centro de alertas</h3><div id="inventoryAlertsList" class="alerts-grid"></div>';
  const kpis=dash.querySelector('.kpis');
  kpis?.insertAdjacentElement('afterend',div);
}
function renderInventoryAlertsV9(){
  insertInventoryAlertsV9();
  const el=$('#inventoryAlertsList'); if(!el) return;
  const low=(products||[]).filter(p=>Number(p.stock||0)<=Number(p.min_stock||0));
  const noMove=(products||[]).filter(p=>Number(p.stock||0)>0 && !saleItems.some(i=>String(i.product_id)===String(p.id))).slice(0,20);
  const lowMargin=(products||[]).filter(p=>realMargin(p)<20 && Number(p.purchase_price||0)>0);
  const openOld=(cashSessions||[]).filter(s=>s.status==='OPEN' && (Date.now()-safeDateV83(s.opened_at).getTime())>24*60*60*1000);
  el.innerHTML=`
    <div class="alert-card danger"><strong>${low.length}</strong><span>productos en stock crítico</span></div>
    <div class="alert-card warn"><strong>${lowMargin.length}</strong><span>productos con margen menor al 20%</span></div>
    <div class="alert-card info"><strong>${noMove.length}</strong><span>productos sin venta registrada</span></div>
    <div class="alert-card danger"><strong>${openOld.length}</strong><span>cajas abiertas desde ayer</span></div>`;
}
const renderDashboardBaseV9=renderDashboard;
renderDashboard=function(){ renderDashboardBaseV9(); renderInventoryAlertsV9(); };
const bindBaseV9=bind;
bind=function(){
  bindBaseV9();
  if($('#printLabels')) $('#printLabels').onclick=printLabelsV9;
  if($('#labelFormat')) $('#labelFormat').onchange=renderLabels;
  if($('#categorySelect')) $('#categorySelect').onchange=()=>{calcSalePrice();};
};
(function bootV9Polish(){
  const title=document.querySelector('title'); if(title) title.textContent='MM Ferretería V9 ERP';
  const brand=document.querySelector('.brand span'); if(brand) brand.textContent='V9 ERP';
  const barcodeInput=$('#barcodeSearch'); if(barcodeInput) barcodeInput.placeholder='Buscar por SKU, código de barras, código fabricante, nombre, marca o alias';
  const supplierInput=$('#supplierCode'); if(supplierInput) supplierInput.placeholder='Código fabricante / proveedor';
})();
bind();
applyRole();
renderLabels();
renderProducts();
renderDashboard();

/* ==========================================================
   V9.1 - Centro de Etiquetas integrado con Inventario
   - Lista desplegable del inventario dentro del módulo.
   - Selección de producto + vista previa fija.
   - Estado: con etiqueta impresa / sin etiqueta impresa.
   - Reimpresión y registro local de última impresión.
   ========================================================== */
let labelSelectedProductIdV91 = null;
let labelPageV91 = 1;
const LABEL_PAGE_SIZE_V91 = 10;
function labelPrintLogV91(){
  try{return JSON.parse(localStorage.getItem('mm_label_print_log_v91')||'{}')}catch(e){return {}}
}
function saveLabelPrintLogV91(productId, qty=1){
  const log=labelPrintLogV91();
  log[String(productId)]={printed_at:new Date().toISOString(), qty:Number(qty||1), user:($('#roleSelect')?.selectedOptions?.[0]?.textContent||'Usuario')};
  localStorage.setItem('mm_label_print_log_v91',JSON.stringify(log));
}
function labelPrintedInfoV91(p){return labelPrintLogV91()[String(p?.id||'')]||null}
function selectedLabelProductV91(){
  return (products||[]).find(p=>String(p.id)===String(labelSelectedProductIdV91)) || selectedProductForLabelV9();
}
function labelFilterRowsV91(){
  const q=($('#barcodeSearch')?.value||'').toLowerCase().trim();
  const cat=$('#labelCategoryFilter')?.value || 'ALL';
  const brand=$('#labelBrandFilter')?.value || 'ALL';
  const printed=$('#labelPrintedFilter')?.value || 'ALL';
  return (products||[]).filter(p=>{
    const catName=p.categories?.name || (categories||[]).find(c=>String(c.id)===String(p.category_id))?.name || 'General';
    const brandName=p.brand || 'Sin marca';
    const hasPrint=!!labelPrintedInfoV91(p);
    return (!q || productSearchTextV9(p).includes(q)) &&
      (cat==='ALL' || catName===cat) &&
      (brand==='ALL' || brandName===brand) &&
      (printed==='ALL' || (printed==='PRINTED' && hasPrint) || (printed==='NOT_PRINTED' && !hasPrint));
  }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}
function fillLabelFiltersV91(){
  const catSel=$('#labelCategoryFilter');
  if(catSel){
    const current=catSel.value||'ALL';
    const cats=[...new Set((products||[]).map(p=>p.categories?.name || (categories||[]).find(c=>String(c.id)===String(p.category_id))?.name || 'General'))].sort();
    catSel.innerHTML='<option value="ALL">Todas</option>'+cats.map(c=>`<option value="${escapeHtmlV6(c)}">${escapeHtmlV6(c)}</option>`).join('');
    catSel.value=[...catSel.options].some(o=>o.value===current)?current:'ALL';
  }
  const brandSel=$('#labelBrandFilter');
  if(brandSel){
    const current=brandSel.value||'ALL';
    const brands=[...new Set((products||[]).map(p=>p.brand||'Sin marca'))].sort();
    brandSel.innerHTML='<option value="ALL">Todas</option>'+brands.map(b=>`<option value="${escapeHtmlV6(b)}">${escapeHtmlV6(b)}</option>`).join('');
    brandSel.value=[...brandSel.options].some(o=>o.value===current)?current:'ALL';
  }
}
function renderLabelProductInfoV91(p){
  const el=$('#labelProductInfo'); if(!el) return;
  if(!p){el.innerHTML='<h4>Información del producto</h4><div class="muted">Selecciona un producto.</div>'; return;}
  const info=labelPrintedInfoV91(p);
  const last=info?.printed_at ? new Date(info.printed_at).toLocaleString() : 'Nunca impresa';
  el.innerHTML=`<h4>Información del producto</h4>
    <div class="info-row"><span>SKU:</span><strong>${escapeHtmlV6(p.internal_code||'')}</strong></div>
    <div class="info-row"><span>Código barras:</span><strong>${escapeHtmlV6(p.barcode||p.internal_code||'')}</strong></div>
    <div class="info-row"><span>Cód. fabricante:</span><strong>${escapeHtmlV6(p.supplier_code||p.manufacturer_code||'N/D')}</strong></div>
    <div class="info-row"><span>Categoría:</span><strong>${escapeHtmlV6(p.categories?.name||'General')}</strong></div>
    <div class="info-row"><span>Marca:</span><strong>${escapeHtmlV6(p.brand||'N/D')}</strong></div>
    <div class="info-row"><span>Precio:</span><strong>${money(p.sale_price)}</strong></div>
    <div class="info-row"><span>Stock actual:</span><strong>${Number(p.stock||0)}</strong></div>
    <div class="info-row"><span>Última impresión:</span><strong>${escapeHtmlV6(last)}</strong></div>`;
}
renderLabels=function(){
  const container=$('#labelPreview'); if(!container) return;
  const qty=Math.max(1,Math.min(200,Number($('#labelQty')?.value||1)));
  const p=selectedLabelProductV91();
  if(!p){container.innerHTML='<div class="label-empty">No hay productos para generar etiqueta.</div>'; renderLabelProductInfoV91(null); return;}
  labelSelectedProductIdV91=p.id;
  const code=String(p.barcode||p.internal_code||nextSkuV9(p.category_id));
  const cls=labelFormatClassV9();
  const showPrice=$('#labelShowPrice')?.checked !== false;
  const showManufacturer=$('#labelShowManufacturer')?.checked === true;
  const manufacturer=p.supplier_code||p.manufacturer_code||'';
  container.innerHTML=Array(qty).fill(0).map((_,i)=>`
    <div class="thermal-label ${cls}" data-barcode="${escapeHtmlV6(code)}">
      <div class="label-name">${escapeHtmlV6(shortProductNameV9(showManufacturer && manufacturer ? manufacturer+' · '+p.name : p.name))}</div>
      <div class="barcode-wrap"><svg class="barcode-svg" id="barcode_${i}"></svg></div>
      <div class="label-footer">
        <span class="label-sku">${escapeHtmlV6(code)}</span>
        <span class="label-price">${showPrice?money(p.sale_price):''}</span>
      </div>
    </div>`).join('');
  if(window.JsBarcode){
    container.querySelectorAll('.barcode-svg').forEach(svg=>{
      try{JsBarcode(svg, code, {format:'CODE128', displayValue:false, margin:0, height:34, width:1.25});}
      catch(e){svg.outerHTML='<div class="barcode-error">Código inválido</div>';}
    });
  }
  renderLabelProductInfoV91(p);
};
function renderLabelCenterV91(){
  fillLabelFiltersV91();
  const rows=labelFilterRowsV91();
  if(!labelSelectedProductIdV91 && rows[0]) labelSelectedProductIdV91=rows[0].id;
  const maxPage=Math.max(1,Math.ceil(rows.length/LABEL_PAGE_SIZE_V91));
  labelPageV91=Math.min(Math.max(1,labelPageV91),maxPage);
  const pageRows=rows.slice((labelPageV91-1)*LABEL_PAGE_SIZE_V91,labelPageV91*LABEL_PAGE_SIZE_V91);
  const table=$('#labelProductsTable');
  if(table){
    table.innerHTML=`<tr><th>Etiqueta</th><th>SKU</th><th>Código barras</th><th>Cód. fabricante</th><th>Producto</th><th>Categoría</th><th>Marca</th><th>Precio</th><th>Stock</th><th>Última etiqueta</th><th>Acciones</th></tr>`+
      pageRows.map(p=>{
        const info=labelPrintedInfoV91(p);
        const last=info?.printed_at ? new Date(info.printed_at).toLocaleString() : 'Nunca';
        const selected=String(p.id)===String(labelSelectedProductIdV91);
        return `<tr class="${selected?'selected':''}" onclick="selectLabelProductV91('${p.id}')">
          <td><span class="print-state ${info?'printed':'pending'}">${info?'● Impresa':'● Pendiente'}</span></td>
          <td><span class="sku">${escapeHtmlV6(p.internal_code||'')}</span></td>
          <td><span class="muted">${escapeHtmlV6(p.barcode||p.internal_code||'')}</span></td>
          <td><span class="muted">${escapeHtmlV6(p.supplier_code||p.manufacturer_code||'')}</span></td>
          <td><div class="product-title">${escapeHtmlV6(p.name||'')}</div></td>
          <td>${escapeHtmlV6(p.categories?.name||'General')}</td>
          <td>${escapeHtmlV6(p.brand||'N/D')}</td>
          <td><strong>${money(p.sale_price)}</strong></td>
          <td>${Number(p.stock||0)}</td>
          <td><span class="muted">${escapeHtmlV6(last)}</span></td>
          <td><div class="label-row-actions"><button onclick="event.stopPropagation();selectLabelProductV91('${p.id}');printLabelsV91();" title="Imprimir">🖨️</button><button onclick="event.stopPropagation();selectLabelProductV91('${p.id}');renderLabels();" title="Vista previa">⋮</button></div></td>
        </tr>`;
      }).join('') || '<tr><td colspan="11" class="muted-row">No hay productos con esos filtros.</td></tr>';
  }
  const pag=$('#labelPagination');
  if(pag){
    const pages=[];
    for(let i=1;i<=maxPage;i++) if(i===1||i===maxPage||Math.abs(i-labelPageV91)<=1) pages.push(i); else if(pages[pages.length-1]!=='...') pages.push('...');
    pag.innerHTML=`<span>Mostrando ${rows.length?((labelPageV91-1)*LABEL_PAGE_SIZE_V91)+1:0} a ${Math.min(labelPageV91*LABEL_PAGE_SIZE_V91,rows.length)} de ${rows.length} productos</span><div class="pages">${pages.map(x=>x==='...'?'<span>...</span>':`<button class="${x===labelPageV91?'active':''}" onclick="labelPageV91=${x};renderLabelCenterV91();">${x}</button>`).join('')}</div><select onchange="labelPageV91=1;renderLabelCenterV91();"><option>${LABEL_PAGE_SIZE_V91} por página</option></select>`;
  }
  renderLabels();
}
window.selectLabelProductV91=function(id){labelSelectedProductIdV91=id;renderLabelCenterV91();};
const printLabelsV91Base = printLabelsV9;
printLabelsV9=function(){
  const p=selectedLabelProductV91();
  if(p) saveLabelPrintLogV91(p.id,$('#labelQty')?.value||1);
  renderLabelCenterV91();
  document.body.classList.add('printing-labels');
  setTimeout(()=>{window.print();setTimeout(()=>{document.body.classList.remove('printing-labels');renderLabelCenterV91();},600);},120);
};
const bindV91Base=bind;
bind=function(){
  bindV91Base();
  ['barcodeSearch','labelCategoryFilter','labelBrandFilter','labelPrintedFilter'].forEach(id=>{const el=$('#'+id); if(el){el.oninput=()=>{labelPageV91=1;renderLabelCenterV91();}; el.onchange=()=>{labelPageV91=1;renderLabelCenterV91();};}});
  ['labelFormat','labelQty','labelShowPrice','labelShowManufacturer'].forEach(id=>{const el=$('#'+id); if(el){el.oninput=renderLabels; el.onchange=renderLabels;}});
  if($('#labelQtyMinus')) $('#labelQtyMinus').onclick=()=>{const q=$('#labelQty'); q.value=Math.max(1,Number(q.value||1)-1); renderLabels();};
  if($('#labelQtyPlus')) $('#labelQtyPlus').onclick=()=>{const q=$('#labelQty'); q.value=Math.min(200,Number(q.value||1)+1); renderLabels();};
  if($('#labelClearFilters')) $('#labelClearFilters').onclick=()=>{if($('#barcodeSearch')) $('#barcodeSearch').value=''; if($('#labelCategoryFilter')) $('#labelCategoryFilter').value='ALL'; if($('#labelBrandFilter')) $('#labelBrandFilter').value='ALL'; if($('#labelPrintedFilter')) $('#labelPrintedFilter').value='ALL'; labelPageV91=1; renderLabelCenterV91();};
  if($('#printLabels')) $('#printLabels').onclick=printLabelsV9;
  if($('#printSelectedLabels')) $('#printSelectedLabels').onclick=()=>printLabelsV9();
  if($('#exportLabelList')) $('#exportLabelList').onclick=()=>alert('Exportar lista queda preparado para V9.2. Por ahora imprime o reimprime desde la tabla.');
};
const showViewV91Base=showView;
showView=function(id,btn){
  showViewV91Base(id,btn);
  if(id==='barcode') setTimeout(renderLabelCenterV91,40);
};
const loadAllV91Base=loadAll;
loadAll=async function(){
  await loadAllV91Base();
  renderLabelCenterV91();
};
bind();
renderLabelCenterV91();


/* ==========================================================
   V9.2 - Pestañas funcionales del Centro de Etiquetas
   Arregla los botones "Inventario", "Generador" y "Configuración".
   ========================================================== */
let activeLabelTabV92='inventory';
function labelSelectedProductCardV92(){
  const el=$('#labelGeneratorSelected'); if(!el) return;
  const p=selectedLabelProductV91();
  if(!p){el.textContent='Selecciona un producto desde Inventario.'; return;}
  el.innerHTML=`<div><span class="muted">Producto</span><br><strong>${escapeHtmlV6(p.name||'')}</strong></div>
    <div><span class="muted">SKU</span><br><span class="sku">${escapeHtmlV6(p.internal_code||'')}</span></div>
    <div><span class="muted">Código de barras</span><br><strong>${escapeHtmlV6(p.barcode||p.internal_code||'')}</strong></div>
    <div><span class="muted">Precio</span><br><strong>${money(p.sale_price)}</strong></div>`;
}
function setLabelTabV92(tab){
  activeLabelTabV92=tab||'inventory';
  document.querySelectorAll('[data-label-tab]').forEach(b=>b.classList.toggle('active',b.dataset.labelTab===activeLabelTabV92));
  const map={inventory:'labelTabInventory',generator:'labelTabGenerator',config:'labelTabConfig'};
  Object.entries(map).forEach(([key,id])=>{const el=$('#'+id); if(el){el.classList.toggle('hidden',key!==activeLabelTabV92); el.classList.toggle('show',key===activeLabelTabV92);}});
  if(activeLabelTabV92==='inventory') renderLabelCenterV91();
  if(activeLabelTabV92==='generator'){renderLabels(); labelSelectedProductCardV92();}
  if(activeLabelTabV92==='config'){renderLabels();}
}
function bindLabelTabsV92(){
  document.querySelectorAll('[data-label-tab]').forEach(btn=>{btn.onclick=()=>setLabelTabV92(btn.dataset.labelTab);});
  const go=$('#labelGoInventory'); if(go) go.onclick=()=>setLabelTabV92('inventory');
  const gen=$('#labelPrintFromGenerator'); if(gen) gen.onclick=()=>printLabelsV9();
  const test=$('#labelTestPrint'); if(test) test.onclick=()=>printLabelsV9();
}
const bindV92Base=bind;
bind=function(){
  bindV92Base();
  bindLabelTabsV92();
};
const renderLabelsV92Base=renderLabels;
renderLabels=function(){
  renderLabelsV92Base();
  labelSelectedProductCardV92();
};
const renderLabelCenterV92Base=renderLabelCenterV91;
renderLabelCenterV91=function(){
  renderLabelCenterV92Base();
  labelSelectedProductCardV92();
};
bind();
setLabelTabV92('inventory');

/* ==========================================================
   V9.3 - Inventario Profesional
   Dashboard de inventario, filtros operativos, tarjetas de producto
   y ficha lateral con stock, margen, etiqueta, kardex simulado e historial.
   ========================================================== */
let inventoryFilterV93 = 'ALL';
let selectedInventoryProductV93 = null;
function productMovedV93(p){
  return (saleItems||[]).some(i=>String(i.product_id)===String(p.id));
}
function stockStateV93(p){
  const stock=Number(p.stock||0), min=Number(p.min_stock||0);
  if(stock<=0) return 'OUT';
  if(stock<=min) return 'LOW';
  return 'OK';
}
function marginV93(p){
  const cost=Number(p.purchase_price||0), sale=Number(p.sale_price||0);
  if(!sale) return 0;
  return ((sale-cost)/sale)*100;
}
function profitUnitV93(p){return Number(p.sale_price||0)-Number(p.purchase_price||0);}
function inventoryValueV93(){return (products||[]).reduce((s,p)=>s+(Number(p.stock||0)*Number(p.purchase_price||0)),0);}
function filteredInventoryRowsV93(){
  const q=($('#productSearch')?.value||'').toLowerCase().trim();
  const cat=$('#inventoryCategoryFilter')?.value||'ALL';
  const stockF=$('#inventoryStockFilter')?.value||'ALL';
  return (products||[]).filter(p=>{
    const text=productSearchTextV9 ? productSearchTextV9(p) : [p.internal_code,p.barcode,p.supplier_code,p.name,p.brand,p.location,p.categories?.name].join(' ').toLowerCase();
    if(q && !text.includes(q)) return false;
    const category=p.categories?.name || 'General';
    if(cat!=='ALL' && category!==cat) return false;
    const state=stockStateV93(p);
    if(stockF==='LOW' && state!=='LOW') return false;
    if(stockF==='OUT' && state!=='OUT') return false;
    if(stockF==='OK' && state!=='OK') return false;
    if(inventoryFilterV93==='LOW' && state!=='LOW') return false;
    if(inventoryFilterV93==='NOMOVE' && productMovedV93(p)) return false;
    if(inventoryFilterV93==='MARGINLOW' && marginV93(p)>=25) return false;
    if(inventoryFilterV93==='LABELS'){
      const info = (typeof labelPrintedInfoV91==='function') ? labelPrintedInfoV91(p) : null;
      if(info) return false;
    }
    return true;
  });
}
function fillInventoryCategoryFilterV93(){
  const sel=$('#inventoryCategoryFilter'); if(!sel) return;
  const current=sel.value||'ALL';
  const cats=[...new Set((products||[]).map(p=>p.categories?.name||'General'))].sort();
  sel.innerHTML='<option value="ALL">Todas las categorías</option>'+cats.map(c=>`<option value="${escapeHtmlV6(c)}">${escapeHtmlV6(c)}</option>`).join('');
  sel.value=cats.includes(current)?current:'ALL';
}
function renderInventoryKpisV93(){
  const el=$('#inventoryKpisPro'); if(!el) return;
  const total=(products||[]).length;
  const low=(products||[]).filter(p=>stockStateV93(p)==='LOW').length;
  const out=(products||[]).filter(p=>stockStateV93(p)==='OUT').length;
  const noMove=(products||[]).filter(p=>Number(p.stock||0)>0&&!productMovedV93(p)).length;
  const value=inventoryValueV93();
  el.innerHTML=`
    <article><span>📦</span><small>Productos</small><b>${total}</b><em>Catálogo activo</em></article>
    <article><span>💰</span><small>Inventario valorizado</small><b>${money(value)}</b><em>Costo x existencia</em></article>
    <article><span>⚠️</span><small>Stock bajo</small><b>${low}</b><em>Comprar pronto</em></article>
    <article><span>⛔</span><small>Agotados</small><b>${out}</b><em>Venta detenida</em></article>
    <article><span>🕒</span><small>Sin movimiento</small><b>${noMove}</b><em>Revisar rotación</em></article>`;
}
function renderInventoryDetailV93(p){
  const panel=$('#inventoryDetailPanel'); if(!panel) return;
  if(!p){
    panel.innerHTML='<div class="detail-empty"><div class="detail-icon">📦</div><h3>Selecciona un producto</h3><p>Verás su ficha, costo, precio, stock, margen, ubicación, etiqueta y trazabilidad.</p></div>';
    return;
  }
  selectedInventoryProductV93=p.id;
  const state=stockStateV93(p);
  const label=(typeof labelPrintedInfoV91==='function') ? labelPrintedInfoV91(p) : null;
  const sold=(saleItems||[]).filter(i=>String(i.product_id)===String(p.id));
  const soldQty=sold.reduce((s,i)=>s+Number(i.quantity||0),0);
  const soldTotal=sold.reduce((s,i)=>s+Number(i.line_total||0),0);
  const cat=p.categories?.name||'General';
  const code=p.barcode||p.internal_code||'';
  const reorder=Math.max(Number(p.min_stock||0)*2, Number(p.max_stock||0)||0);
  panel.innerHTML=`
    <div class="detail-head">
      <div class="product-avatar">${escapeHtmlV6((p.name||'P').trim().charAt(0).toUpperCase())}</div>
      <div><h3>${escapeHtmlV6(p.name||'Producto')}</h3><p>${escapeHtmlV6(cat)} ${p.brand?'• '+escapeHtmlV6(p.brand):''}</p></div>
    </div>
    <div class="detail-code-box"><span>SKU</span><strong>${escapeHtmlV6(p.internal_code||'Sin SKU')}</strong><small>Barcode: ${escapeHtmlV6(code||'N/D')}</small></div>
    <div class="detail-grid">
      <div><small>Costo</small><b>${money(p.purchase_price)}</b></div>
      <div><small>Venta</small><b>${money(p.sale_price)}</b></div>
      <div><small>Margen</small><b class="${marginV93(p)<25?'bad':'good'}">${marginV93(p).toFixed(1)}%</b></div>
      <div><small>Utilidad/u</small><b>${money(profitUnitV93(p))}</b></div>
      <div><small>Stock</small><b>${Number(p.stock||0)} ${escapeHtmlV6(p.unit_type||'UND')}</b></div>
      <div><small>Estado</small><b class="state-${state.toLowerCase()}">${state==='OK'?'Disponible':state==='LOW'?'Stock bajo':'Agotado'}</b></div>
    </div>
    <div class="detail-section"><h4>Inventario</h4>
      <div class="detail-row"><span>Mínimo</span><strong>${Number(p.min_stock||0)}</strong></div>
      <div class="detail-row"><span>Máximo</span><strong>${Number(p.max_stock||0)}</strong></div>
      <div class="detail-row"><span>Punto sugerido de compra</span><strong>${Math.ceil(reorder||Number(p.min_stock||0))}</strong></div>
      <div class="detail-row"><span>Ubicación</span><strong>${escapeHtmlV6(p.location||'Sin ubicación')}</strong></div>
    </div>
    <div class="detail-section"><h4>Etiqueta</h4>
      <div class="detail-row"><span>Estado</span><strong>${label?'Impresa':'Pendiente'}</strong></div>
      <div class="detail-row"><span>Última impresión</span><strong>${label?.printed_at?new Date(label.printed_at).toLocaleString():'Nunca'}</strong></div>
      <button class="primary wide" onclick="selectLabelProductV91 && selectLabelProductV91('${p.id}'); showView('barcode', document.querySelector('[data-view=barcode]')); setTimeout(()=>{setLabelTabV92 && setLabelTabV92('generator');},80);">Generar etiqueta</button>
    </div>
    <div class="detail-section"><h4>Ventas registradas</h4>
      <div class="detail-row"><span>Cantidad vendida</span><strong>${soldQty}</strong></div>
      <div class="detail-row"><span>Total vendido</span><strong>${money(soldTotal)}</strong></div>
    </div>
    <div class="detail-section"><h4>Kardex rápido</h4>
      <div class="kardex-mini">
        <div><span>Actual</span><b>${Number(p.stock||0)}</b></div>
        <div><span>Ventas</span><b>-${soldQty}</b></div>
        <div><span>Valor</span><b>${money(Number(p.stock||0)*Number(p.purchase_price||0))}</b></div>
      </div>
      <small class="muted">El kardex definitivo quedará conectado a movimientos reales en la migración V9.</small>
    </div>
    <div class="detail-actions">
      <button class="ghost adminOnly ${!isAdmin()?'adminLocked':''}" onclick="editProduct('${p.id}')">Editar producto</button>
      <button class="ghost" onclick="window.print()">Imprimir ficha</button>
    </div>`;
}
function inventoryCardV93(p){
  const state=stockStateV93(p);
  const label=(typeof labelPrintedInfoV91==='function') ? labelPrintedInfoV91(p) : null;
  const selected=String(selectedInventoryProductV93||'')===String(p.id);
  return `<article class="inventory-pro-card ${selected?'selected':''} inv-${state.toLowerCase()}" onclick="renderInventoryDetailV93((products||[]).find(x=>String(x.id)==='${p.id}'))">
    <div class="inv-card-main">
      <div class="inv-card-code"><strong>${escapeHtmlV6(p.internal_code||'Sin SKU')}</strong><span>${escapeHtmlV6(p.barcode||p.supplier_code||'Sin barcode')}</span></div>
      <div><h3>${escapeHtmlV6(p.name||'Producto')}</h3><p>${escapeHtmlV6(p.categories?.name||'General')} ${p.brand?'• '+escapeHtmlV6(p.brand):''}</p></div>
    </div>
    <div class="inv-card-metrics">
      <div><small>Stock</small><b>${Number(p.stock||0)}</b></div>
      <div><small>Venta</small><b>${money(p.sale_price)}</b></div>
      <div><small>Margen</small><b class="${marginV93(p)<25?'bad':'good'}">${marginV93(p).toFixed(0)}%</b></div>
      <div><small>Ubicación</small><b>${escapeHtmlV6(p.location||'N/D')}</b></div>
    </div>
    <div class="inv-card-footer">
      <span class="stock-badge ${state.toLowerCase()}">${state==='OK'?'Disponible':state==='LOW'?'Stock bajo':'Agotado'}</span>
      <span class="label-badge ${label?'printed':'pending'}">${label?'Etiqueta impresa':'Sin etiqueta'}</span>
      <button onclick="event.stopPropagation();selectLabelProductV91 && selectLabelProductV91('${p.id}'); showView('barcode', document.querySelector('[data-view=barcode]')); setTimeout(()=>{setLabelTabV92 && setLabelTabV92('generator');},80);">🏷️</button>
    </div>
  </article>`;
}
const renderProductsV93Previous = renderProducts;
renderProducts=function(){
  if(!$('#inventoryKpisPro')) return renderProductsV93Previous();
  fillInventoryCategoryFilterV93();
  renderInventoryKpisV93();
  const rows=filteredInventoryRowsV93();
  const table=$('#productsTable'); if(!table) return;
  table.className='inventory-pro-list';
  table.innerHTML=rows.slice(0,220).map(inventoryCardV93).join('') || '<div class="detail-empty"><div class="detail-icon">🔎</div><h3>No hay productos con esos filtros</h3><p>Prueba limpiar filtros o revisar la búsqueda. El inventario no va a confesar si lo interrogas mal.</p></div>';
  const current=(products||[]).find(p=>String(p.id)===String(selectedInventoryProductV93)) || rows[0];
  renderInventoryDetailV93(current||null);
};
const bindV93Base=bind;
bind=function(){
  bindV93Base();
  ['productSearch','inventoryCategoryFilter','inventoryStockFilter'].forEach(id=>{const el=$('#'+id); if(el){el.oninput=renderProducts; el.onchange=renderProducts;}});
  document.querySelectorAll('[data-inv-filter]').forEach(btn=>{
    btn.onclick=()=>{inventoryFilterV93=btn.dataset.invFilter||'ALL'; document.querySelectorAll('[data-inv-filter]').forEach(b=>b.classList.toggle('active',b===btn)); renderProducts();};
  });
  document.querySelectorAll('[data-view-jump]').forEach(btn=>{btn.onclick=()=>showView(btn.dataset.viewJump, document.querySelector(`[data-view="${btn.dataset.viewJump}"]`));});
};
const loadAllV93Base=loadAll;
loadAll=async function(){
  await loadAllV93Base();
  renderProducts();
};
const showViewV93Base=showView;
showView=function(id,btn){
  showViewV93Base(id,btn);
  if(id==='products') setTimeout(renderProducts,40);
};
bind();
renderProducts();

/* ==========================================================
   V10 - MM Comercial ERP Multiunidad
   - Una sola base de datos para Ferretería y Librería.
   - Filtro global por unidad de negocio.
   - Productos, POS, inventario, etiquetas y rentabilidad filtrables.
   - Formulario de producto con unidad de negocio y unidad de medida normalizada.
   ========================================================== */
let businessUnitsV10 = [];
let businessUnitsDbReadyV10 = false;
let selectedBusinessUnitV10 = localStorage.getItem('mm_business_unit') || 'ALL';

function fallbackBusinessUnitsV10(){
  return [
    {id:'FERRETERIA', name:'MM Ferretería', code:'FER', color:'#F97316'},
    {id:'LIBRERIA', name:'MM Librería', code:'LIB', color:'#3B82F6'}
  ];
}
function unitNameV10(id){
  const u=(businessUnitsV10||[]).find(x=>String(x.id)===String(id));
  return u?.name || (id==='FERRETERIA'?'MM Ferretería':id==='LIBRERIA'?'MM Librería':'Sin unidad');
}
function productBusinessUnitIdV10(p){
  return p?.business_unit_id || p?.business_units?.id || p?.categories?.business_unit_id || null;
}
function productBusinessUnitNameV10(p){
  const id=productBusinessUnitIdV10(p);
  if(id) return unitNameV10(id);
  const cat=String(p?.categories?.name||'').toLowerCase();
  if(['cuaderno','lapiz','lápiz','marcador','resma','papel','oficina','escolar','libreria','librería'].some(x=>cat.includes(x))) return 'MM Librería';
  return 'MM Ferretería';
}
function matchesBusinessUnitV10(p){
  if(selectedBusinessUnitV10==='ALL') return true;
  const id=productBusinessUnitIdV10(p);
  if(id) return String(id)===String(selectedBusinessUnitV10);
  return productBusinessUnitNameV10(p)===unitNameV10(selectedBusinessUnitV10) || selectedBusinessUnitV10==='FERRETERIA';
}
function addBusinessUnitUIV10(){
  if(!$('#businessUnitFilter')){
    const sel=document.createElement('select');
    sel.id='businessUnitFilter';
    sel.title='Unidad de negocio';
    const top=document.querySelector('.topActions');
    top?.insertBefore(sel, top.firstChild);
    sel.onchange=()=>{
      selectedBusinessUnitV10=sel.value;
      localStorage.setItem('mm_business_unit', selectedBusinessUnitV10);
      renderCategoryTabs(); renderDashboard(); renderPOS(); renderProducts(); renderLabels(); renderProfitability();
    };
  }
  fillBusinessUnitSelectsV10();
}
function fillBusinessUnitSelectsV10(){
  const units=(businessUnitsV10&&businessUnitsV10.length)?businessUnitsV10:fallbackBusinessUnitsV10();
  const filter=$('#businessUnitFilter');
  if(filter){
    filter.innerHTML='<option value="ALL">Todas las unidades</option>'+units.map(u=>`<option value="${escapeHtmlV6(u.id)}">${escapeHtmlV6(u.name)}</option>`).join('');
    filter.value=selectedBusinessUnitV10;
  }
  const productBU=$('#productBusinessUnit');
  if(productBU){
    productBU.innerHTML='<option value="">Unidad de negocio</option>'+units.map(u=>`<option value="${escapeHtmlV6(u.id)}">${escapeHtmlV6(u.name)}</option>`).join('');
  }
}
const loadAllV10Base=loadAll;
loadAll=async function(){
  await loadAllV10Base();
  const r=await sb.from('business_units').select('*').order('name',{ascending:true});
  if(!r.error && Array.isArray(r.data) && r.data.length){
    businessUnitsV10=r.data; businessUnitsDbReadyV10=true;
  }else{
    businessUnitsV10=fallbackBusinessUnitsV10(); businessUnitsDbReadyV10=false;
    console.warn('V10 business_units no disponible. Ejecuta supabase/schema_v10_multiunidad.sql para activar Ferretería/Librería real.');
  }
  addBusinessUnitUIV10();
  renderDashboard(); renderPOS(); renderProducts(); renderLabels(); renderProfitability();
};
const renderDashboardV10Base=renderDashboard;
renderDashboard=function(){
  const originalProducts=products;
  products=originalProducts.filter(matchesBusinessUnitV10);
  renderDashboardV10Base();
  products=originalProducts;
  const subtitle=$('#subtitle');
  if(subtitle){
    subtitle.textContent = selectedBusinessUnitV10==='ALL'
      ? 'Vista consolidada: Ferretería + Librería en una sola operación.'
      : `Vista filtrada: ${unitNameV10(selectedBusinessUnitV10)}.`;
  }
};
const filteredProductsForPOSV10Base=filteredProductsForPOS;
filteredProductsForPOS=function(){
  return filteredProductsForPOSV10Base().filter(matchesBusinessUnitV10);
};
const productSearchTextV10Base=productSearchTextV9;
productSearchTextV9=function(p){
  return [productSearchTextV10Base(p), productBusinessUnitNameV10(p)].join(' ').toLowerCase();
};
const fillCategorySelectV10Base=fillCategorySelect;
fillCategorySelect=function(){
  fillBusinessUnitSelectsV10();
  const unit=$('#productBusinessUnit')?.value || selectedBusinessUnitV10;
  const cats=(categories||[]).filter(c=>unit==='ALL'||!c.business_unit_id||String(c.business_unit_id)===String(unit));
  $('#categorySelect').innerHTML='<option value="">Sin categoría</option>'+cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
};
const renderCategoryTabsV10Base=renderCategoryTabs;
renderCategoryTabs=function(){
  const cats=(categories||[]).filter(c=>selectedBusinessUnitV10==='ALL'||!c.business_unit_id||String(c.business_unit_id)===String(selectedBusinessUnitV10));
  const tabs=['ALL',...cats.map(c=>c.name)];
  $('#categoryTabs').innerHTML=tabs.map(t=>`<button class="${selectedCategory===t?'active':''}" onclick="selectCategory('${t.replaceAll("'","\\'")}')">${t==='ALL'?'Todos':t}</button>`).join('');
};
const filteredInventoryRowsV10Base=filteredInventoryRowsV93;
filteredInventoryRowsV93=function(){
  return filteredInventoryRowsV10Base().filter(matchesBusinessUnitV10);
};
const inventoryCardV10Base=inventoryCardV93;
inventoryCardV93=function(p){
  return inventoryCardV10Base(p).replace('<div class="inv-card-footer">', `<div class="business-unit-chip">${escapeHtmlV6(productBusinessUnitNameV10(p))}</div><div class="inv-card-footer">`);
};
const renderInventoryDetailV10Base=renderInventoryDetailV93;
renderInventoryDetailV93=function(p){
  renderInventoryDetailV10Base(p);
  if(p){
    const box=document.querySelector('#inventoryDetailPanel .detail-code-box');
    if(box && !box.querySelector('.detail-business-unit')){
      box.insertAdjacentHTML('beforeend', `<small class="detail-business-unit">Unidad: ${escapeHtmlV6(productBusinessUnitNameV10(p))}</small>`);
    }
  }
};
const selectedProductForLabelV10Base=selectedProductForLabelV9;
selectedProductForLabelV9=function(){
  const q=($('#barcodeSearch')?.value||'').toLowerCase().trim();
  return (products||[]).filter(matchesBusinessUnitV10).find(p=>!q || productSearchTextV9(p).includes(q)) || (products||[]).filter(matchesBusinessUnitV10)[0];
};
const editProductV10Base=window.editProduct;
window.editProduct=function(id){
  editProductV10Base(id);
  const p=(products||[]).find(x=>String(x.id)===String(id));
  fillBusinessUnitSelectsV10();
  if($('#productBusinessUnit')) $('#productBusinessUnit').value=productBusinessUnitIdV10(p)||'';
};
const saveProductV10Previous=saveProduct;
saveProduct=async function(e){
  e.preventDefault();
  if(!guardAdmin()) return;
  const m=$('#profitMargin').value;
  const manual=m==='manual';
  const cost=Number($('#purchasePrice').value||0);
  const sale=manual?Number($('#salePrice').value||0):Math.ceil(cost*(1+Number(m)/100));
  const categoryId=$('#categorySelect').value||null;
  const payload={
    supplier_code:$('#supplierCode').value||null,
    name:$('#productName').value,
    category_id:categoryId,
    brand:$('#brand').value||null,
    unit_type:$('#unitType').value,
    purchase_price:cost,
    profit_margin:manual?0:Number(m),
    allow_manual_price:manual,
    sale_price:sale,
    stock:Number($('#stock').value||0),
    min_stock:Number($('#minStock').value||0),
    max_stock:Number($('#maxStock').value||0),
    location:$('#location').value||null,
    last_cost_update:new Date().toISOString()
  };
  if(businessUnitsDbReadyV10 && $('#productBusinessUnit')?.value) payload.business_unit_id=$('#productBusinessUnit').value;
  let r;
  if($('#productId').value){
    r=await sb.from('products').update(payload).eq('id',$('#productId').value);
  }else{
    const code=nextSkuV9(categoryId);
    r=await sb.from('products').insert({...payload,internal_code:code,barcode:code,status:'ACTIVE'});
  }
  if(r.error) return alert(r.error.message);
  resetProductForm(); await loadAll();
};
const renderProfitabilityV10Base=renderProfitability;
renderProfitability=function(){
  const originalProducts=products;
  products=originalProducts.filter(matchesBusinessUnitV10);
  renderProfitabilityV10Base();
  products=originalProducts;
};
(function bootV10(){
  const title=document.querySelector('title'); if(title) title.textContent='MM Comercial ERP V10 Multiunidad';
  document.querySelector('.brand b') && (document.querySelector('.brand b').textContent='MM Comercial');
  document.querySelector('.brand span') && (document.querySelector('.brand span').textContent='V10 Multiunidad');
  addBusinessUnitUIV10();
  if($('#productBusinessUnit')) $('#productBusinessUnit').onchange=()=>{ fillCategorySelect(); calcSalePrice(); };
})();

/* ==========================================================
   V10.2 REAL - Multiunidad visible + Maestro de Productos
   Corrige: unidad desplegable, tipo de venta, Ferretería/Librería visibles.
   ========================================================== */
const UNITS_V102 = {
  UNIDAD:[['UND','Unidad'],['PAR','Par'],['JGO','Juego'],['KIT','Kit']],
  PESO:[['LB','Libra'],['KG','Kilogramo']],
  LONGITUD:[['M','Metro'],['CM','Centímetro'],['FT','Pie']],
  VOLUMEN:[['GAL','Galón'],['LT','Litro'],['ML','Mililitro'],['CUB','Cubeta'],['TUB','Tubo']],
  PAQUETE:[['CJ','Caja'],['PQ','Paquete'],['BOL','Bolsa'],['SAC','Saco'],['RLL','Rollo']],
  KIT:[['KIT','Kit'],['JGO','Juego'],['SET','Set']]
};
function unitFullNameV102(code){
  const all=Object.values(UNITS_V102).flat();
  const item=all.find(x=>x[0]===String(code||'').toUpperCase());
  return item ? `${item[1]} (${item[0]})` : (code||'UND');
}
function isDecimalUnitV102(code){return ['LB','KG','M','CM','FT','GAL','LT','ML'].includes(String(code||'').toUpperCase());}
function selectedUnitCodeV102(){
  const raw=selectedBusinessUnitV10 || localStorage.getItem('mm_business_unit') || 'ALL';
  const unit=(businessUnitsV10||[]).find(u=>String(u.id)===String(raw)||String(u.code)===String(raw));
  return raw==='ALL'?'ALL':(unit?.code || raw);
}
function unitByCodeOrIdV102(value){
  return (businessUnitsV10||[]).find(u=>String(u.id)===String(value)||String(u.code)===String(value)||String(u.name)===String(value));
}
function productBusinessUnitObjV102(p){
  const id=productBusinessUnitIdV10(p);
  if(id){
    const found=unitByCodeOrIdV102(id);
    if(found) return found;
  }
  const name=productBusinessUnitNameV10(p);
  return (businessUnitsV10||[]).find(u=>u.name===name) || (name.includes('Libr')?{code:'LIB',name:'MM Librería',color:'#3B82F6'}:{code:'FER',name:'MM Ferretería',color:'#F97316'});
}
function matchesBusinessUnitV102(p){
  const sel=selectedUnitCodeV102();
  if(sel==='ALL') return true;
  const u=productBusinessUnitObjV102(p);
  return String(u.code||'').toUpperCase()===String(sel).toUpperCase();
}
function setBusinessFilterV102(code){
  selectedBusinessUnitV10=code;
  localStorage.setItem('mm_business_unit', code);
  renderBusinessSwitchV102();
  fillBusinessUnitSelectsV102();
  fillCategorySelect();
  renderDashboard(); renderPOS(); renderProducts(); renderLabels(); renderProfitability();
}
function renderBusinessSwitchV102(){
  let host=document.querySelector('.content') || document.body;
  let bar=document.getElementById('businessSwitchbar');
  if(!bar){
    bar=document.createElement('div'); bar.id='businessSwitchbar'; bar.className='business-switchbar';
    host.insertBefore(bar, host.firstElementChild);
  }
  const units=(businessUnitsV10&&businessUnitsV10.length?businessUnitsV10:fallbackBusinessUnitsV10()).map(u=>({id:u.id,code:u.code||u.id,name:u.name}));
  const selected=selectedUnitCodeV102();
  bar.innerHTML=`<strong>MM Comercial</strong><button class="${selected==='ALL'?'active':''}" onclick="setBusinessFilterV102('ALL')">Todas</button>`+
    units.map(u=>`<button class="${selected===u.code?'active':''}" onclick="setBusinessFilterV102('${escapeHtmlV6(u.code)}')">${escapeHtmlV6(u.name.replace('MM ',''))}</button>`).join('')+
    `<small>Una sola caja y una sola factura, reportes separados por negocio.</small>`;
}
function fillBusinessUnitSelectsV102(){
  const units=(businessUnitsV10&&businessUnitsV10.length?businessUnitsV10:fallbackBusinessUnitsV10());
  const opts='<option value="">Unidad de negocio</option>'+units.map(u=>`<option value="${escapeHtmlV6(u.id)}">${escapeHtmlV6(u.name)}</option>`).join('');
  if($('#productBusinessUnit')) $('#productBusinessUnit').innerHTML=opts;
  const sel=$('#businessUnitFilter'); if(sel){ sel.innerHTML='<option value="ALL">Todas las unidades</option>'+units.map(u=>`<option value="${escapeHtmlV6(u.code||u.id)}">${escapeHtmlV6(u.name)}</option>`).join(''); sel.value=selectedUnitCodeV102(); }
}
function updateUnitOptionsV102(preferred){
  const saleType=$('#saleType')?.value || 'UNIDAD';
  const opts=UNITS_V102[saleType] || UNITS_V102.UNIDAD;
  if($('#unitType')){
    $('#unitType').innerHTML=opts.map(([code,name])=>`<option value="${code}">${name} (${code})</option>`).join('');
    $('#unitType').value = preferred && opts.some(x=>x[0]===preferred) ? preferred : opts[0][0];
  }
  const u=$('#unitType')?.value || 'UND';
  if($('#unitHelper')) $('#unitHelper').textContent = `${unitFullNameV102(u)} ${isDecimalUnitV102(u)?'permite decimales en POS.':'no permite decimales.'}`;
}
function businessSummaryV102(rows){
  const fer=rows.filter(p=>productBusinessUnitObjV102(p).code==='FER');
  const lib=rows.filter(p=>productBusinessUnitObjV102(p).code==='LIB');
  const val=arr=>arr.reduce((a,p)=>a+Number(p.stock||0)*Number(p.purchase_price||0),0);
  return `<div class="inventory-business-summary"><div class="summary-card orange"><span>Productos Ferretería</span><b>${fer.length}</b></div><div class="summary-card blue"><span>Productos Librería</span><b>${lib.length}</b></div><div class="summary-card"><span>Inventario valorizado visible</span><b>${money(val(rows))}</b></div><div class="summary-card"><span>Stock bajo visible</span><b>${rows.filter(p=>Number(p.stock)<=Number(p.min_stock||0)).length}</b></div></div>`;
}
function productSearchTextV102(p){
  return [p.internal_code,p.barcode,p.supplier_code,p.manufacturer_code,p.name,p.aliases,p.brand,p.location,p.unit_type,p.sale_type,p.categories?.name,productBusinessUnitObjV102(p).name].join(' ').toLowerCase();
}
renderProducts = function(){
  const q=($('#productSearch')?.value||'').toLowerCase().trim();
  const cat=$('#inventoryCategoryFilter')?.value||'ALL';
  const stockFilter=$('#inventoryStockFilter')?.value||'ALL';
  let rows=(products||[]).filter(matchesBusinessUnitV102).filter(p=>!q||productSearchTextV102(p).includes(q));
  if(cat!=='ALL') rows=rows.filter(p=>String(p.category_id)===String(cat)||String(p.categories?.name)===String(cat));
  if(stockFilter==='LOW') rows=rows.filter(p=>Number(p.stock||0)<=Number(p.min_stock||0)&&Number(p.stock||0)>0);
  if(stockFilter==='OUT') rows=rows.filter(p=>Number(p.stock||0)<=0);
  if(stockFilter==='OK') rows=rows.filter(p=>Number(p.stock||0)>Number(p.min_stock||0));
  rows=rows.slice(0,180);
  const cards=rows.map(p=>{
    const bu=productBusinessUnitObjV102(p); const buClass=bu.code==='LIB'?'blue':'orange';
    const unit=p.unit_type||'UND'; const saleType=p.sale_type||'UNIDAD';
    return `<div class="inv-card-v102"><div><div class="sku">${escapeHtmlV6(p.internal_code||'SIN-SKU')}</div><div class="muted">${escapeHtmlV6(p.barcode||'Sin barcode')}</div></div><div><div class="name">${escapeHtmlV6(cleanProductNameV6(p))}</div><div class="muted">${escapeHtmlV6(p.brand||'Sin marca')} · ${escapeHtmlV6(p.categories?.name||'General')} · Ref: ${escapeHtmlV6(p.supplier_code||p.manufacturer_code||'N/D')}</div><div style="margin-top:6px"><span class="chip ${buClass}">${escapeHtmlV6(bu.name)}</span><span class="chip">${escapeHtmlV6(saleType)}</span><span class="chip">${escapeHtmlV6(unitFullNameV102(unit))}</span></div></div><div><div class="muted">Stock</div><div class="stock">${Number(p.stock||0)} <small>${escapeHtmlV6(unit)}</small></div></div><div><div class="muted">Precio</div><div class="price">${money(p.sale_price)}</div></div><div><div class="muted">Ubicación</div><b>${escapeHtmlV6(p.location||'Sin ubicar')}</b></div><button class="adminOnly ${!isAdmin()?'adminLocked':''}" onclick="editProduct('${p.id}')">Editar</button></div>`;
  }).join('') || '<div class="cartItems empty">No hay productos para mostrar con este filtro.</div>';
  const html=businessSummaryV102(rows)+cards;
  const el=$('#productsTable'); if(el){ el.className='inventory-list-v102'; el.innerHTML=html; }
};
fillCategorySelect = function(){
  fillBusinessUnitSelectsV102();
  const selectedBU=$('#productBusinessUnit')?.value || null;
  const selectedCode=selectedUnitCodeV102();
  let cats=(categories||[]).filter(c=>{
    if(selectedBU) return !c.business_unit_id || String(c.business_unit_id)===String(selectedBU);
    if(selectedCode==='ALL') return true;
    const bu=unitByCodeOrIdV102(c.business_unit_id); return !c.business_unit_id || (bu?.code===selectedCode);
  });
  if($('#categorySelect')) $('#categorySelect').innerHTML='<option value="">Sin categoría</option>'+cats.map(c=>`<option value="${c.id}">${escapeHtmlV6(c.name)}</option>`).join('');
  if($('#inventoryCategoryFilter')) $('#inventoryCategoryFilter').innerHTML='<option value="ALL">Todas las categorías</option>'+cats.map(c=>`<option value="${c.id}">${escapeHtmlV6(c.name)}</option>`).join('');
};
window.editProduct = function(id){
  if(!guardAdmin()) return;
  const p=(products||[]).find(x=>String(x.id)===String(id)); if(!p) return;
  fillBusinessUnitSelectsV102();
  $('#productId').value=p.id; $('#supplierCode').value=p.supplier_code||''; $('#productName').value=p.name||''; $('#categorySelect').value=p.category_id||''; $('#brand').value=p.brand||'';
  if($('#manufacturerCode')) $('#manufacturerCode').value=p.manufacturer_code||'';
  if($('#productAlias')) $('#productAlias').value=p.aliases||'';
  if($('#productBusinessUnit')) $('#productBusinessUnit').value=productBusinessUnitIdV10(p)||'';
  if($('#saleType')) $('#saleType').value=p.sale_type||inferSaleTypeFromUnitV102(p.unit_type)||'UNIDAD';
  updateUnitOptionsV102(p.unit_type||'UND');
  $('#purchasePrice').value=p.purchase_price||0; $('#profitMargin').value=p.allow_manual_price?'manual':String(Number(p.profit_margin||35)); $('#salePrice').value=rawMoney(p.sale_price); $('#stock').value=p.stock||0; $('#minStock').value=p.min_stock||0; $('#maxStock').value=p.max_stock||0; $('#location').value=p.location||'';
  $('#productForm').classList.remove('hidden'); $('#productForm').scrollIntoView({behavior:'smooth',block:'start'});
};
function inferSaleTypeFromUnitV102(unit){
  unit=String(unit||'UND').toUpperCase();
  for(const [type,items] of Object.entries(UNITS_V102)){ if(items.some(x=>x[0]===unit)) return type; }
  return 'UNIDAD';
}
saveProduct = async function(e){
  e.preventDefault(); if(!guardAdmin()) return;
  const m=$('#profitMargin').value, manual=m==='manual', cost=Number($('#purchasePrice').value||0), sale=manual?Number($('#salePrice').value||0):Math.ceil(cost*(1+Number(m)/100));
  const categoryId=$('#categorySelect').value||null;
  const payload={supplier_code:$('#supplierCode').value||null,name:$('#productName').value,category_id:categoryId,brand:$('#brand').value||null,unit_type:$('#unitType').value,purchase_price:cost,profit_margin:manual?0:Number(m),allow_manual_price:manual,sale_price:sale,stock:Number($('#stock').value||0),min_stock:Number($('#minStock').value||0),max_stock:Number($('#maxStock').value||0),location:$('#location').value||null,last_cost_update:new Date().toISOString(),business_unit_id:$('#productBusinessUnit').value||null,sale_type:$('#saleType')?.value||'UNIDAD',allows_decimal:isDecimalUnitV102($('#unitType').value),manufacturer_code:$('#manufacturerCode')?.value||null,aliases:$('#productAlias')?.value||null};
  let r;
  if($('#productId').value) r=await sb.from('products').update(payload).eq('id',$('#productId').value);
  else { const code=nextSkuV9(categoryId); r=await sb.from('products').insert({...payload,internal_code:code,barcode:code,status:'ACTIVE'}); }
  if(r.error) return alert(r.error.message+'\n\nSi menciona una columna faltante, ejecuta supabase/schema_v10_2_maestro_productos.sql.');
  resetProductForm(); await loadAll();
};
const filteredProductsForPOSV102Base = filteredProductsForPOS;
filteredProductsForPOS = function(){ return filteredProductsForPOSV102Base().filter(matchesBusinessUnitV102); };
const renderDashboardV102Base = renderDashboard;
renderDashboard = function(){
  const original=products; products=original.filter(matchesBusinessUnitV102); renderDashboardV102Base(); products=original; renderBusinessSwitchV102();
  const subtitle=$('#subtitle'); if(subtitle) subtitle.textContent = selectedUnitCodeV102()==='ALL'?'Vista consolidada Ferretería + Librería.':'Vista filtrada: '+(selectedUnitCodeV102()==='LIB'?'MM Librería':'MM Ferretería')+'.';
};
(function bootV102(){
  document.querySelector('.brand b') && (document.querySelector('.brand b').textContent='MM Comercial');
  document.querySelector('.brand span') && (document.querySelector('.brand span').textContent='V10.2 Maestro');
  window.setBusinessFilterV102=setBusinessFilterV102;
  setTimeout(()=>{renderBusinessSwitchV102(); fillBusinessUnitSelectsV102(); fillCategorySelect(); updateUnitOptionsV102(); if($('#saleType')) $('#saleType').onchange=()=>updateUnitOptionsV102(); if($('#unitType')) $('#unitType').onchange=()=>updateUnitOptionsV102($('#unitType').value); if($('#productBusinessUnit')) $('#productBusinessUnit').onchange=()=>fillCategorySelect(); if($('#productForm')) $('#productForm').onsubmit=saveProduct; if($('#newProductBtn')) $('#newProductBtn').onclick=()=>{if(guardAdmin()){resetProductForm(); fillBusinessUnitSelectsV102(); updateUnitOptionsV102(); $('#productForm').classList.remove('hidden');}}; renderProducts();},150);
})();

/* ==========================================================
   V10.4 - Fix real de multiunidad POS / Inventario / Ventas
   - No encadena filtros viejos V10/V10.2 que comparaban UUID contra FER/LIB.
   - Cada producto se resuelve a código FER o LIB.
   - Una sola factura, detalle de venta separado por unidad de negocio.
   ========================================================== */
function normV104(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
function selectedUnitCodeV104(){
  const raw=String(selectedBusinessUnitV10 || localStorage.getItem('mm_business_unit') || 'ALL');
  if(raw==='ALL') return 'ALL';
  const u=(businessUnitsV10||[]).find(x=>String(x.id)===raw || String(x.code)===raw || String(x.name)===raw);
  if(u?.code) return String(u.code).toUpperCase();
  const n=normV104(raw);
  if(n.includes('lib')) return 'LIB';
  if(n.includes('fer')) return 'FER';
  if(raw.toUpperCase()==='LIB') return 'LIB';
  return 'FER';
}
function businessUnitByCodeV104(code){
  const c=String(code||'FER').toUpperCase();
  return (businessUnitsV10||[]).find(u=>String(u.code).toUpperCase()===c)
    || fallbackBusinessUnitsV10().find(u=>String(u.code).toUpperCase()===c)
    || {id:c, code:c, name:c==='LIB'?'MM Librería':'MM Ferretería', color:c==='LIB'?'#3B82F6':'#F97316'};
}
function categoryObjV104(p){
  return p?.categories || (categories||[]).find(c=>String(c.id)===String(p?.category_id)) || null;
}
function inferUnitCodeFromTextV104(p){
  const c=categoryObjV104(p);
  const text=normV104([p?.name,p?.internal_code,p?.supplier_code,p?.barcode,p?.aliases,p?.brand,c?.name,c?.code].join(' '));
  const libWords=['libreria','papeleria','escolar','oficina','cuaderno','lapiz','lapicero','boligrafo','marcador','resma','papel','cartulina','folder','tinta','toner','borrador','sacapunta','regla','mochila','pegamento','tijera'];
  return libWords.some(w=>text.includes(w)) ? 'LIB' : 'FER';
}
function productBusinessUnitCodeV104(p){
  if(p?.business_units?.code) return String(p.business_units.code).toUpperCase();
  if(p?.business_unit?.code) return String(p.business_unit.code).toUpperCase();
  if(p?.business_unit_code) return String(p.business_unit_code).toUpperCase();
  const directId=p?.business_unit_id;
  if(directId){
    const u=(businessUnitsV10||[]).find(x=>String(x.id)===String(directId) || String(x.code)===String(directId));
    if(u?.code) return String(u.code).toUpperCase();
    const n=normV104(directId);
    if(n.includes('lib')) return 'LIB';
    if(n.includes('fer')) return 'FER';
  }
  const c=categoryObjV104(p);
  if(c?.business_units?.code) return String(c.business_units.code).toUpperCase();
  if(c?.business_unit_id){
    const u=(businessUnitsV10||[]).find(x=>String(x.id)===String(c.business_unit_id) || String(x.code)===String(c.business_unit_id));
    if(u?.code) return String(u.code).toUpperCase();
  }
  return inferUnitCodeFromTextV104(p);
}
function productBusinessUnitObjV104(p){
  return businessUnitByCodeV104(productBusinessUnitCodeV104(p));
}
function matchesBusinessUnitV104(p){
  const selected=selectedUnitCodeV104();
  return selected==='ALL' || productBusinessUnitCodeV104(p)===selected;
}
function categoryBusinessUnitCodeV104(c){
  if(c?.business_units?.code) return String(c.business_units.code).toUpperCase();
  if(c?.business_unit_id){
    const u=(businessUnitsV10||[]).find(x=>String(x.id)===String(c.business_unit_id) || String(x.code)===String(c.business_unit_id));
    if(u?.code) return String(u.code).toUpperCase();
  }
  const n=normV104([c?.name,c?.code].join(' '));
  return ['libreria','papeleria','escolar','oficina','cuaderno','lapiz','marcador','resma','papel','tinta','toner'].some(w=>n.includes(w)) ? 'LIB' : 'FER';
}
function setBusinessFilterV104(code){
  selectedBusinessUnitV10=String(code||'ALL').toUpperCase();
  localStorage.setItem('mm_business_unit', selectedBusinessUnitV10);
  selectedCategory='ALL';
  renderBusinessSwitchV104();
  fillCategorySelect();
  renderCategoryTabs();
  renderDashboard(); renderPOS(); renderProducts(); renderLabels(); renderProfitability(); renderCart();
}
window.setBusinessFilterV102=setBusinessFilterV104;
window.setBusinessFilterV104=setBusinessFilterV104;
function renderBusinessSwitchV104(){
  let host=document.querySelector('.content') || document.body;
  let bar=document.getElementById('businessSwitchbar');
  if(!bar){
    bar=document.createElement('div'); bar.id='businessSwitchbar'; bar.className='business-switchbar';
    const title=document.getElementById('title');
    (title?.parentElement||host).insertBefore(bar,(title?.parentElement||host).children[1]||null);
  }
  const selected=selectedUnitCodeV104();
  bar.innerHTML=`<strong>MM Comercial</strong>
    <button class="${selected==='ALL'?'active':''}" onclick="setBusinessFilterV104('ALL')">Todas</button>
    <button class="${selected==='FER'?'active':''}" onclick="setBusinessFilterV104('FER')">Ferretería</button>
    <button class="${selected==='LIB'?'active':''}" onclick="setBusinessFilterV104('LIB')">Librería</button>
    <small>Una sola factura, inventario y reportes separados por unidad.</small>`;
  const filter=$('#businessUnitFilter');
  if(filter) filter.value=selected;
}
function fillBusinessUnitSelectsV104(){
  const units=(businessUnitsV10&&businessUnitsV10.length?businessUnitsV10:fallbackBusinessUnitsV10());
  if($('#productBusinessUnit')) $('#productBusinessUnit').innerHTML='<option value="">Unidad de negocio</option>'+units.map(u=>`<option value="${escapeHtmlV6(u.id)}">${escapeHtmlV6(u.name)}</option>`).join('');
  const sel=$('#businessUnitFilter');
  if(sel){
    sel.innerHTML='<option value="ALL">Todas las unidades</option>'+units.map(u=>`<option value="${escapeHtmlV6(u.code||u.id)}">${escapeHtmlV6(u.name)}</option>`).join('');
    sel.value=selectedUnitCodeV104();
    sel.onchange=()=>setBusinessFilterV104(sel.value);
  }
}
fillBusinessUnitSelectsV102=fillBusinessUnitSelectsV104;
productBusinessUnitObjV102=productBusinessUnitObjV104;
matchesBusinessUnitV102=matchesBusinessUnitV104;
selectedUnitCodeV102=selectedUnitCodeV104;
renderBusinessSwitchV102=renderBusinessSwitchV104;
fillBusinessUnitSelectsV10=fillBusinessUnitSelectsV104;

renderCategoryTabs=function(){
  const selected=selectedUnitCodeV104();
  const cats=(categories||[]).filter(c=>selected==='ALL' || categoryBusinessUnitCodeV104(c)===selected);
  const tabs=['ALL',...cats.map(c=>c.name)];
  const el=$('#categoryTabs');
  if(el) el.innerHTML=tabs.map(t=>`<button class="${selectedCategory===t?'active':''}" onclick="selectCategory('${String(t).replaceAll("'","\\'")}')">${t==='ALL'?'Todos':escapeHtmlV6(t)}</button>`).join('');
};
window.selectCategory=cat=>{selectedCategory=cat;renderCategoryTabs();renderPOS();};

fillCategorySelect=function(){
  fillBusinessUnitSelectsV104();
  const selected=selectedUnitCodeV104();
  const cats=(categories||[]).filter(c=>selected==='ALL' || categoryBusinessUnitCodeV104(c)===selected);
  if($('#categorySelect')) $('#categorySelect').innerHTML='<option value="">Sin categoría</option>'+cats.map(c=>`<option value="${c.id}">${escapeHtmlV6(c.name)}</option>`).join('');
  if($('#inventoryCategoryFilter')) $('#inventoryCategoryFilter').innerHTML='<option value="ALL">Todas las categorías</option>'+cats.map(c=>`<option value="${c.id}">${escapeHtmlV6(c.name)}</option>`).join('');
};

filteredProductsForPOS=function(){
  const q=normV104($('#posSearch')?.value||'');
  return (products||[]).filter(p=>{
    if(!matchesBusinessUnitV104(p)) return false;
    const cat=categoryObjV104(p)?.name || '';
    const byCat=selectedCategory==='ALL' || String(cat)===String(selectedCategory);
    const text=normV104([p.internal_code,p.supplier_code,p.manufacturer_code,p.barcode,p.name,p.aliases,p.brand,cat,productBusinessUnitObjV104(p).name].join(' '));
    return byCat && (!q || text.includes(q));
  }).slice(0,80);
};
renderPOS=function(){
  renderBusinessSwitchV104();
  renderCategoryTabs();
  const rows=filteredProductsForPOS();
  const el=$('#posResults');
  if(!el) return;
  el.innerHTML=rows.map(p=>{
    const bu=productBusinessUnitObjV104(p); const buClass=bu.code==='LIB'?'blue':'orange';
    return `<article class="productCard ${Number(p.stock)<=Number(p.min_stock)?'low':''}" onclick="addToCart('${p.id}')">
      <div class="code">${escapeHtmlV6(p.internal_code||'SIN-SKU')}</div>
      <div class="name">${escapeHtmlV6(cleanProductNameV6 ? cleanProductNameV6(p) : p.name)}</div>
      <div class="price">${money(p.sale_price)}</div>
      <div class="meta"><span>Stock: ${Number(p.stock||0)}</span><span>${escapeHtmlV6(categoryObjV104(p)?.name||'General')}</span></div>
      <div style="margin-top:8px"><span class="chip ${buClass}">${escapeHtmlV6(bu.name)}</span></div>
    </article>`;
  }).join('')||'<div class="cartItems empty">No hay resultados</div>';
};

window.addToCart=id=>{
  if(!canSell()) return alert('Este rol no puede vender.');
  const p=(products||[]).find(x=>String(x.id)===String(id));
  if(!p) return;
  if(Number(p.stock)<=0) return alert('Sin stock.');
  const i=cart.find(x=>String(x.id)===String(id));
  if(i){ if(Number(i.qty)+1>Number(p.stock)) return alert('No hay suficiente stock.'); i.qty=Number(i.qty)+1; }
  else cart.push({...p,qty:1,unit_price:rawMoney(p.sale_price),unit_cost:Number(p.purchase_price||0),business_unit_id:p.business_unit_id||productBusinessUnitObjV104(p).id,business_unit_code:productBusinessUnitCodeV104(p)});
  if($('#posSearch')) $('#posSearch').value=''; renderPOS(); renderCart();
};

renderProducts=function(){
  const q=normV104($('#productSearch')?.value||'');
  const cat=$('#inventoryCategoryFilter')?.value||'ALL';
  const stockFilter=$('#inventoryStockFilter')?.value||'ALL';
  let rows=(products||[]).filter(matchesBusinessUnitV104).filter(p=>!q||normV104([p.internal_code,p.barcode,p.supplier_code,p.manufacturer_code,p.name,p.aliases,p.brand,p.location,p.unit_type,p.sale_type,categoryObjV104(p)?.name,productBusinessUnitObjV104(p).name].join(' ')).includes(q));
  if(cat!=='ALL') rows=rows.filter(p=>String(p.category_id)===String(cat)||String(categoryObjV104(p)?.name)===String(cat));
  if(stockFilter==='LOW') rows=rows.filter(p=>Number(p.stock||0)<=Number(p.min_stock||0)&&Number(p.stock||0)>0);
  if(stockFilter==='OUT') rows=rows.filter(p=>Number(p.stock||0)<=0);
  if(stockFilter==='OK') rows=rows.filter(p=>Number(p.stock||0)>Number(p.min_stock||0));
  rows=rows.slice(0,180);
  const cards=rows.map(p=>{
    const bu=productBusinessUnitObjV104(p); const buClass=bu.code==='LIB'?'blue':'orange';
    const unit=p.unit_type||'UND'; const saleType=p.sale_type||'UNIDAD';
    return `<div class="inv-card-v102"><div><div class="sku">${escapeHtmlV6(p.internal_code||'SIN-SKU')}</div><div class="muted">${escapeHtmlV6(p.barcode||'Sin barcode')}</div></div><div><div class="name">${escapeHtmlV6(cleanProductNameV6 ? cleanProductNameV6(p) : p.name)}</div><div class="muted">${escapeHtmlV6(p.brand||'Sin marca')} · ${escapeHtmlV6(categoryObjV104(p)?.name||'General')} · Ref: ${escapeHtmlV6(p.supplier_code||p.manufacturer_code||'N/D')}</div><div style="margin-top:6px"><span class="chip ${buClass}">${escapeHtmlV6(bu.name)}</span><span class="chip">${escapeHtmlV6(saleType)}</span><span class="chip">${escapeHtmlV6(unitFullNameV102(unit))}</span></div></div><div><div class="muted">Stock</div><div class="stock">${Number(p.stock||0)} <small>${escapeHtmlV6(unit)}</small></div></div><div><div class="muted">Precio</div><div class="price">${money(p.sale_price)}</div></div><div><div class="muted">Ubicación</div><b>${escapeHtmlV6(p.location||'Sin ubicar')}</b></div><button class="adminOnly ${!isAdmin()?'adminLocked':''}" onclick="editProduct('${p.id}')">Editar</button></div>`;
  }).join('') || '<div class="cartItems empty">No hay productos para mostrar con este filtro.</div>';
  const html=businessSummaryV102(rows)+cards;
  const el=$('#productsTable'); if(el){ el.className='inventory-list-v102'; el.innerHTML=html; }
};

renderDashboard=function(){
  const original=products;
  products=original.filter(matchesBusinessUnitV104);
  renderDashboardV10Base();
  products=original;
  renderBusinessSwitchV104();
  const subtitle=$('#subtitle');
  if(subtitle) subtitle.textContent = selectedUnitCodeV104()==='ALL'?'Vista consolidada: Ferretería + Librería en una sola operación.':'Vista filtrada: '+(selectedUnitCodeV104()==='LIB'?'MM Librería':'MM Ferretería')+'.';
};

finishSale=async function(){
  if(!cart.length) return alert('Carrito vacío.');
  const sessionId=$('#activeCashBox').value;
  if(!sessionId) return alert('Debes abrir/seleccionar caja antes de vender.');
  const total=saleTotal(), received=Number($('#amountReceived').value||0), method=$('#paymentMethod').value;
  if(method==='EFECTIVO'&&received<total) return alert('Monto recibido menor al total.');
  const profit=cart.reduce((a,i)=>a+((i.unit_price-i.unit_cost)*Number(i.qty)),0);
  const salePayload={invoice_no:'MM-'+Date.now(),customer_id:selectedCustomer?.id||null,payment_method:method,subtotal:cartSubtotal(),discount:saleDiscount(),tax:0,total,amount_received:received,change_amount:Math.max(0,received-total),status:'COMPLETED',invoice_type:'TICKET',payment_reference:$('#paymentReference').value||null,cash_session_id:sessionId,profit_total:profit};
  const {data:sale,error:se}=await sb.from('sales').insert(salePayload).select().single();
  if(se) return alert(se.message);
  const items=cart.map(i=>({sale_id:sale.id,product_id:i.id,product_code:i.internal_code,product_name:i.name,quantity:i.qty,unit_price:i.unit_price,discount:0,total:Number(i.qty)*i.unit_price,unit_cost:i.unit_cost,profit_amount:(i.unit_price-i.unit_cost)*Number(i.qty),profit_margin:i.unit_cost>0?((i.unit_price-i.unit_cost)/i.unit_cost)*100:0,business_unit_id:i.business_unit_id||productBusinessUnitObjV104(i).id}));
  const {error:ie}=await sb.from('sale_items').insert(items);
  if(ie) return alert(ie.message+'\n\nEjecuta supabase/schema_v10_4_multiunidad_real.sql antes de vender.');
  for(const i of cart){
    await sb.from('products').update({stock:Number(i.stock)-Number(i.qty)}).eq('id',i.id);
    await sb.from('inventory_movements').insert({product_id:i.id,movement_type:'SALIDA',quantity:i.qty,reference:sale.invoice_no,notes:'Venta POS V10.4'});
  }
  lastSale={...sale,items,customer_name:selectedCustomer?.name||'Cliente eventual'};
  renderTicket(lastSale); $('#ticketModal').classList.remove('hidden');
  cart=[]; selectedCustomer=null; $('#customerSearch').value=''; $('#amountReceived').value=''; $('#saleDiscount').value='0'; $('#paymentReference').value='';
  await loadAll();
};
if($('#finishSale')) $('#finishSale').onclick=finishSale;

(function bootV104(){
  const title=document.querySelector('title'); if(title) title.textContent='MM Comercial ERP V10.4 Multiunidad Real';
  document.querySelector('.brand b') && (document.querySelector('.brand b').textContent='MM Comercial');
  document.querySelector('.brand span') && (document.querySelector('.brand span').textContent='V10.4 Multiunidad');
  setTimeout(()=>{fillBusinessUnitSelectsV104(); renderBusinessSwitchV104(); fillCategorySelect(); renderCategoryTabs(); renderDashboard(); renderPOS(); renderProducts();},250);
})();

/* ==========================================================
   V10.4.3 - Corrección UI Maestro Producto + ficha inventario
   ========================================================== */
function showToastV1043(message,type='warning'){
  const old=document.querySelector('.mm-toast'); if(old) old.remove();
  const icon=type==='success'?'✅':type==='error'?'⛔':'⚠️';
  const title=type==='success'?'Listo':type==='error'?'Error':'Atención';
  const toast=document.createElement('div');
  toast.className=`mm-toast mm-toast-${type}`;
  toast.innerHTML=`<div class="mm-toast-icon">${icon}</div><div><strong>${title}</strong><p>${escapeHtmlV6(String(message||''))}</p></div>`;
  document.body.appendChild(toast);
  setTimeout(()=>toast.classList.add('show'),20);
  setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),260)},3600);
}
function openProductModalV1043(){
  const form=$('#productForm'); if(!form) return;
  form.classList.remove('hidden');
  document.body.style.overflow='hidden';
  setTimeout(()=>$('#productBusinessUnit')?.focus(),60);
}
function closeProductModalV1043(){
  const form=$('#productForm'); if(!form) return;
  form.classList.add('hidden');
  document.body.style.overflow='';
}
const resetProductFormV1043Base=resetProductForm;
resetProductForm=function(){
  resetProductFormV1043Base();
  closeProductModalV1043();
};
function renderInventoryDetailSafeV1043(p){
  if(typeof renderInventoryDetailV93==='function'){
    renderInventoryDetailV93(p);
  }else{
    const panel=$('#inventoryDetailPanel');
    if(panel && p){
      panel.innerHTML=`<div class="detail-head"><div class="product-avatar">${escapeHtmlV6((p.name||'P').charAt(0).toUpperCase())}</div><div><h3>${escapeHtmlV6(p.name||'Producto')}</h3><p>${escapeHtmlV6(productBusinessUnitObjV104(p).name)}</p></div></div><div class="detail-code-box"><span>SKU</span><strong>${escapeHtmlV6(p.internal_code||'SIN-SKU')}</strong><small>${escapeHtmlV6(p.barcode||'Sin barcode')}</small></div><div class="detail-grid"><div><small>Costo</small><b>${money(p.purchase_price)}</b></div><div><small>Venta</small><b>${money(p.sale_price)}</b></div><div><small>Stock</small><b>${Number(p.stock||0)}</b></div><div><small>Ubicación</small><b>${escapeHtmlV6(p.location||'Sin ubicar')}</b></div></div>`;
    }
  }
}
window.selectInventoryProductV1043=function(id){
  selectedInventoryProductV93=String(id);
  const p=(products||[]).find(x=>String(x.id)===String(id));
  renderInventoryDetailSafeV1043(p);
  document.querySelectorAll('.inv-card-v102').forEach(card=>card.classList.toggle('selected',card.dataset.productId===String(id)));
};
renderProducts=function(){
  const q=normV104($('#productSearch')?.value||'');
  const cat=$('#inventoryCategoryFilter')?.value||'ALL';
  const stockFilter=$('#inventoryStockFilter')?.value||'ALL';
  let rows=(products||[]).filter(matchesBusinessUnitV104).filter(p=>!q||normV104([p.internal_code,p.barcode,p.supplier_code,p.manufacturer_code,p.name,p.aliases,p.brand,p.location,p.unit_type,p.sale_type,categoryObjV104(p)?.name,productBusinessUnitObjV104(p).name].join(' ')).includes(q));
  if(cat!=='ALL') rows=rows.filter(p=>String(p.category_id)===String(cat)||String(categoryObjV104(p)?.name)===String(cat));
  if(stockFilter==='LOW') rows=rows.filter(p=>Number(p.stock||0)<=Number(p.min_stock||0)&&Number(p.stock||0)>0);
  if(stockFilter==='OUT') rows=rows.filter(p=>Number(p.stock||0)<=0);
  if(stockFilter==='OK') rows=rows.filter(p=>Number(p.stock||0)>Number(p.min_stock||0));
  rows=rows.slice(0,180);
  const cards=rows.map(p=>{
    const bu=productBusinessUnitObjV104(p); const buClass=bu.code==='LIB'?'blue':'orange';
    const unit=p.unit_type||'UND'; const saleType=p.sale_type||'UNIDAD'; const selected=String(selectedInventoryProductV93||'')===String(p.id);
    return `<div class="inv-card-v102 ${selected?'selected':''}" data-product-id="${escapeHtmlV6(p.id)}" onclick="selectInventoryProductV1043('${escapeHtmlV6(p.id)}')"><div><div class="sku">${escapeHtmlV6(p.internal_code||'SIN-SKU')}</div><div class="muted">${escapeHtmlV6(p.barcode||'Sin barcode')}</div></div><div><div class="name">${escapeHtmlV6(cleanProductNameV6 ? cleanProductNameV6(p) : p.name)}</div><div class="muted">${escapeHtmlV6(p.brand||'Sin marca')} · ${escapeHtmlV6(categoryObjV104(p)?.name||'General')} · Ref: ${escapeHtmlV6(p.supplier_code||p.manufacturer_code||'N/D')}</div><div style="margin-top:6px"><span class="chip ${buClass}">${escapeHtmlV6(bu.name)}</span><span class="chip">${escapeHtmlV6(saleType)}</span><span class="chip">${escapeHtmlV6(unitFullNameV102(unit))}</span></div></div><div><div class="muted">Stock</div><div class="stock">${Number(p.stock||0)} <small>${escapeHtmlV6(unit)}</small></div></div><div><div class="muted">Precio</div><div class="price">${money(p.sale_price)}</div></div><div><div class="muted">Ubicación</div><b>${escapeHtmlV6(p.location||'Sin ubicar')}</b></div><button class="adminOnly ${!isAdmin()?'adminLocked':''}" onclick="event.stopPropagation();editProduct('${escapeHtmlV6(p.id)}')">Editar</button></div>`;
  }).join('') || '<div class="cartItems empty">No hay productos para mostrar con este filtro.</div>';
  const html=businessSummaryV102(rows)+cards;
  const el=$('#productsTable'); if(el){ el.className='inventory-list-v102'; el.innerHTML=html; }
  const selected=(products||[]).find(p=>String(p.id)===String(selectedInventoryProductV93));
  if(selected && rows.some(p=>String(p.id)===String(selected.id))) renderInventoryDetailSafeV1043(selected);
};
window.editProduct=function(id){
  if(!guardAdmin()) return;
  const p=(products||[]).find(x=>String(x.id)===String(id)); if(!p) return;
  fillBusinessUnitSelectsV104();
  $('#productId').value=p.id; $('#supplierCode').value=p.supplier_code||''; $('#productName').value=p.name||''; $('#brand').value=p.brand||'';
  if($('#manufacturerCode')) $('#manufacturerCode').value=p.manufacturer_code||'';
  if($('#productAlias')) $('#productAlias').value=p.aliases||'';
  if($('#productBusinessUnit')) $('#productBusinessUnit').value=productBusinessUnitIdV10(p)||'';
  fillCategorySelect();
  $('#categorySelect').value=p.category_id||'';
  if($('#saleType')) $('#saleType').value=p.sale_type||inferSaleTypeFromUnitV102(p.unit_type)||'UNIDAD';
  updateUnitOptionsV102(p.unit_type||'UND');
  $('#purchasePrice').value=p.purchase_price||0; $('#profitMargin').value=p.allow_manual_price?'manual':String(Number(p.profit_margin||35)); $('#salePrice').value=rawMoney(p.sale_price); $('#stock').value=p.stock||0; $('#minStock').value=p.min_stock||0; $('#maxStock').value=p.max_stock||0; $('#location').value=p.location||'';
  openProductModalV1043();
};
const finishSaleV1043Base=finishSale;
finishSale=async function(){
  if(!cart.length) return showToastV1043('Carrito vacío.','warning');
  const sessionId=$('#activeCashBox').value;
  if(!sessionId) return showToastV1043('Debes abrir o seleccionar una caja antes de vender.','warning');
  const total=saleTotal(), received=Number($('#amountReceived').value||0), method=$('#paymentMethod').value;
  if(method==='EFECTIVO'&&received<total) return showToastV1043('Monto recibido menor al total.','warning');
  return finishSaleV1043Base();
};
if($('#finishSale')) $('#finishSale').onclick=finishSale;
(function bootV1043(){
  if($('#cancelProduct')) $('#cancelProduct').onclick=resetProductForm;
  if($('#newProductBtn')) $('#newProductBtn').onclick=()=>{if(guardAdmin()){resetProductFormV1043Base();fillBusinessUnitSelectsV104();updateUnitOptionsV102();openProductModalV1043();}};
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && !$('#productForm')?.classList.contains('hidden')) resetProductForm();});
})();

/* ==========================================================
   V10.5 - Inventario funcional + modal estable + filtros reales
   - Botones de inventario conectados.
   - Ficha lateral seleccionable de verdad.
   - Nuevo producto abre en ventana emergente y toma unidad actual.
   - Centro de etiquetas navega correctamente.
   ========================================================== */
let inventoryFilterV105 = localStorage.getItem('mm_inventory_filter') || 'ALL';

function marginPercentV105(p){
  const cost=Number(p?.purchase_price||0), sale=Number(p?.sale_price||0);
  if(sale>0 && cost>=0) return ((sale-cost)/sale)*100;
  return Number(p?.profit_margin||0);
}
function productHasMovementV105(p){
  return (saleItems||[]).some(i=>String(i.product_id)===String(p?.id));
}
function productHasLabelV105(p){
  const printed=(typeof labelPrintedInfoV91==='function') ? labelPrintedInfoV91(p) : null;
  return Boolean(printed || p?.barcode || p?.internal_code);
}
function stockStateV105(p){
  const stock=Number(p?.stock||0), min=Number(p?.min_stock||0);
  if(stock<=0) return 'OUT';
  if(stock<=min) return 'LOW';
  return 'OK';
}
function unitIdByCodeV105(code){
  const u=businessUnitByCodeV104(String(code||'FER').toUpperCase());
  return u?.id || null;
}
function defaultProductBusinessUnitIdV105(){
  const selected=selectedUnitCodeV104();
  if(selected==='FER' || selected==='LIB') return unitIdByCodeV105(selected);
  return unitIdByCodeV105('FER');
}
function baseInventoryRowsV105(){
  const q=normV104($('#productSearch')?.value||'');
  const cat=$('#inventoryCategoryFilter')?.value||'ALL';
  const stockFilter=$('#inventoryStockFilter')?.value||'ALL';
  let rows=(products||[]).filter(matchesBusinessUnitV104);

  if(q){
    rows=rows.filter(p=>normV104([
      p.internal_code,p.barcode,p.supplier_code,p.manufacturer_code,p.name,p.clean_name,
      p.aliases,p.synonyms,p.brand,p.model,p.location,p.unit_type,p.sale_type,
      categoryObjV104(p)?.name,productBusinessUnitObjV104(p).name
    ].join(' ')).includes(q));
  }

  if(cat!=='ALL'){
    rows=rows.filter(p=>String(p.category_id)===String(cat) || String(categoryObjV104(p)?.name)===String(cat));
  }

  if(stockFilter==='LOW') rows=rows.filter(p=>stockStateV105(p)==='LOW');
  if(stockFilter==='OUT') rows=rows.filter(p=>stockStateV105(p)==='OUT');
  if(stockFilter==='OK') rows=rows.filter(p=>stockStateV105(p)==='OK');

  if(inventoryFilterV105==='LOW') rows=rows.filter(p=>stockStateV105(p)==='LOW' || stockStateV105(p)==='OUT');
  if(inventoryFilterV105==='NOMOVE') rows=rows.filter(p=>!productHasMovementV105(p));
  if(inventoryFilterV105==='MARGINLOW') rows=rows.filter(p=>marginPercentV105(p)<20);
  if(inventoryFilterV105==='LABELS') rows=rows.filter(p=>!productHasLabelV105(p));

  return rows;
}
function renderInventoryKpisV105(rows){
  const el=$('#inventoryKpisPro'); if(!el) return;
  const visible=(products||[]).filter(matchesBusinessUnitV104);
  const low=visible.filter(p=>stockStateV105(p)==='LOW').length;
  const out=visible.filter(p=>stockStateV105(p)==='OUT').length;
  const noMove=visible.filter(p=>!productHasMovementV105(p)).length;
  const lowMargin=visible.filter(p=>marginPercentV105(p)<20).length;
  const value=visible.reduce((s,p)=>s+Number(p.stock||0)*Number(p.purchase_price||0),0);
  el.innerHTML=`
    <article><span>📦</span><small>Productos visibles</small><b>${visible.length}</b><em>${selectedUnitCodeV104()==='ALL'?'Todas las unidades':productBusinessUnitObjV104(visible[0]||{}).name}</em></article>
    <article><span>💰</span><small>Inventario valorizado</small><b>${money(value)}</b><em>Costo x existencia</em></article>
    <article><span>⚠️</span><small>Stock bajo</small><b>${low}</b><em>Comprar pronto</em></article>
    <article><span>⛔</span><small>Agotados</small><b>${out}</b><em>Venta detenida</em></article>
    <article><span>📉</span><small>Margen bajo</small><b>${lowMargin}</b><em>Menor al 20%</em></article>
    <article><span>🕒</span><small>Sin movimiento</small><b>${noMove}</b><em>Revisar rotación</em></article>`;
}
function inventoryFilterLabelV105(){
  return ({ALL:'Productos',LOW:'Stock bajo',NOMOVE:'Sin movimiento',MARGINLOW:'Margen bajo',LABELS:'Sin etiqueta'}[inventoryFilterV105]||'Productos');
}
function renderInventoryDetailV105(p){
  const panel=$('#inventoryDetailPanel'); if(!panel) return;
  if(!p){
    panel.innerHTML='<div class="detail-empty"><div class="detail-icon">📦</div><h3>Selecciona un producto</h3><p>Verás su ficha, costo, precio, stock, margen, ubicación, etiqueta y trazabilidad.</p></div>';
    return;
  }
  selectedInventoryProductV93=String(p.id);
  const bu=productBusinessUnitObjV104(p);
  const state=stockStateV105(p);
  const sold=(saleItems||[]).filter(i=>String(i.product_id)===String(p.id));
  const soldQty=sold.reduce((s,i)=>s+Number(i.quantity||0),0);
  const soldTotal=sold.reduce((s,i)=>s+Number(i.total||i.line_total||0),0);
  const margin=marginPercentV105(p);
  const labelOk=productHasLabelV105(p);
  panel.innerHTML=`
    <div class="detail-head">
      <div class="product-avatar">${escapeHtmlV6((p.name||'P').charAt(0).toUpperCase())}</div>
      <div><h3>${escapeHtmlV6(p.name||'Producto')}</h3><p>${escapeHtmlV6(categoryObjV104(p)?.name||'General')} · ${escapeHtmlV6(bu.name||'Sin unidad')}</p></div>
    </div>
    <div class="detail-code-box"><span>SKU</span><strong>${escapeHtmlV6(p.internal_code||'SIN-SKU')}</strong><small>Barcode: ${escapeHtmlV6(p.barcode||'N/D')}</small><small class="detail-business-unit">Unidad: ${escapeHtmlV6(bu.name||'')}</small></div>
    <div class="detail-grid">
      <div><small>Costo</small><b>${money(p.purchase_price)}</b></div>
      <div><small>Venta</small><b>${money(p.sale_price)}</b></div>
      <div><small>Margen</small><b class="${margin<20?'bad':'good'}">${margin.toFixed(1)}%</b></div>
      <div><small>Utilidad/u</small><b>${money(Number(p.sale_price||0)-Number(p.purchase_price||0))}</b></div>
      <div><small>Stock</small><b>${Number(p.stock||0)} ${escapeHtmlV6(p.unit_type||'UND')}</b></div>
      <div><small>Estado</small><b class="state-${state.toLowerCase()}">${state==='OK'?'Disponible':state==='LOW'?'Stock bajo':'Agotado'}</b></div>
    </div>
    <div class="detail-section"><h4>Inventario</h4>
      <div class="detail-row"><span>Mínimo</span><strong>${Number(p.min_stock||0)}</strong></div>
      <div class="detail-row"><span>Máximo</span><strong>${Number(p.max_stock||p.stock_max||0)}</strong></div>
      <div class="detail-row"><span>Ubicación</span><strong>${escapeHtmlV6(p.location||'Sin ubicación')}</strong></div>
      <div class="detail-row"><span>Movimiento</span><strong>${productHasMovementV105(p)?'Con venta registrada':'Sin movimiento'}</strong></div>
    </div>
    <div class="detail-section"><h4>Etiqueta</h4>
      <div class="detail-row"><span>Estado</span><strong>${labelOk?'Lista':'Pendiente'}</strong></div>
      <button class="primary wide" onclick="selectLabelProductV91 && selectLabelProductV91('${escapeHtmlV6(p.id)}'); showView('barcode', document.querySelector('[data-view=barcode]')); setTimeout(()=>{setLabelTabV92 && setLabelTabV92('generator');},80);">Generar etiqueta</button>
    </div>
    <div class="detail-section"><h4>Ventas registradas</h4>
      <div class="detail-row"><span>Cantidad vendida</span><strong>${soldQty}</strong></div>
      <div class="detail-row"><span>Total vendido</span><strong>${money(soldTotal)}</strong></div>
    </div>
    <div class="detail-actions">
      <button class="ghost adminOnly ${!isAdmin()?'adminLocked':''}" onclick="editProduct('${escapeHtmlV6(p.id)}')">Editar producto</button>
      <button class="ghost" onclick="window.print()">Imprimir ficha</button>
    </div>`;
}
window.selectInventoryProductV105=function(id){
  const p=(products||[]).find(x=>String(x.id)===String(id));
  renderInventoryDetailV105(p||null);
  document.querySelectorAll('.inv-card-v102').forEach(card=>card.classList.toggle('selected',card.dataset.productId===String(id)));
};
function inventoryCardV105(p){
  const bu=productBusinessUnitObjV104(p), buClass=bu.code==='LIB'?'blue':'orange';
  const state=stockStateV105(p), selected=String(selectedInventoryProductV93||'')===String(p.id);
  const margin=marginPercentV105(p);
  return `<div class="inv-card-v102 ${selected?'selected':''} inv-${state.toLowerCase()}" data-product-id="${escapeHtmlV6(p.id)}" onclick="selectInventoryProductV105('${escapeHtmlV6(p.id)}')">
    <div><div class="sku">${escapeHtmlV6(p.internal_code||'SIN-SKU')}</div><div class="muted">${escapeHtmlV6(p.barcode||p.supplier_code||'Sin barcode')}</div></div>
    <div><div class="name">${escapeHtmlV6(typeof cleanProductNameV6==='function'?cleanProductNameV6(p):(p.name||'Producto'))}</div><div class="muted">${escapeHtmlV6(p.brand||'Sin marca')} · ${escapeHtmlV6(categoryObjV104(p)?.name||'General')} · Ref: ${escapeHtmlV6(p.manufacturer_code||p.supplier_code||'N/D')}</div><div style="margin-top:6px"><span class="chip ${buClass}">${escapeHtmlV6(bu.name)}</span><span class="chip">${escapeHtmlV6(p.sale_type||'UNIDAD')}</span><span class="chip">${escapeHtmlV6(unitFullNameV102(p.unit_type||'UND'))}</span></div></div>
    <div><div class="muted">Stock</div><div class="stock">${Number(p.stock||0)} <small>${escapeHtmlV6(p.unit_type||'UND')}</small></div></div>
    <div><div class="muted">Precio</div><div class="price">${money(p.sale_price)}</div><small class="${margin<20?'bad':'good'}">Margen ${margin.toFixed(0)}%</small></div>
    <div><div class="muted">Ubicación</div><b>${escapeHtmlV6(p.location||'Sin ubicar')}</b></div>
    <button class="adminOnly ${!isAdmin()?'adminLocked':''}" onclick="event.stopPropagation();editProduct('${escapeHtmlV6(p.id)}')">Editar</button>
  </div>`;
}
renderProducts=function(){
  const table=$('#productsTable'); if(!table) return;
  fillCategorySelect();
  const rows=baseInventoryRowsV105();
  renderInventoryKpisV105(rows);
  document.querySelectorAll('[data-inv-filter]').forEach(btn=>btn.classList.toggle('active',(btn.dataset.invFilter||'ALL')===inventoryFilterV105));
  table.className='inventory-list-v102';
  table.innerHTML = `<div class="inventory-filter-title"><strong>${escapeHtmlV6(inventoryFilterLabelV105())}</strong><span>${rows.length} resultado(s)</span></div>` +
    (rows.slice(0,220).map(inventoryCardV105).join('') || '<div class="detail-empty"><div class="detail-icon">🔎</div><h3>No hay resultados</h3><p>Limpiá filtros o revisá si los productos están asignados a la unidad correcta.</p></div>');
  const current=rows.find(p=>String(p.id)===String(selectedInventoryProductV93)) || rows[0];
  renderInventoryDetailV105(current||null);
};
function setInventoryFilterV105(filter){
  inventoryFilterV105=String(filter||'ALL');
  localStorage.setItem('mm_inventory_filter', inventoryFilterV105);
  if($('#inventoryStockFilter')) $('#inventoryStockFilter').value='ALL';
  renderProducts();
}
window.setInventoryFilterV105=setInventoryFilterV105;
function prepareNewProductV105(){
  if(!guardAdmin()) return;
  resetProductFormV1043Base();
  fillBusinessUnitSelectsV104();
  const bu=$('#productBusinessUnit');
  if(bu && !bu.value) bu.value=defaultProductBusinessUnitIdV105()||'';
  fillCategorySelect();
  updateUnitOptionsV102();
  const pill=document.querySelector('.version-pill'); if(pill) pill.textContent='V10.5';
  openProductModalV1043();
}
function bindInventoryV105(){
  document.querySelectorAll('[data-inv-filter]').forEach(btn=>{
    btn.onclick=()=>setInventoryFilterV105(btn.dataset.invFilter||'ALL');
  });
  document.querySelectorAll('[data-view-jump]').forEach(btn=>{
    btn.onclick=()=>showView(btn.dataset.viewJump, document.querySelector(`[data-view="${btn.dataset.viewJump}"]`));
  });
  ['productSearch','inventoryCategoryFilter','inventoryStockFilter'].forEach(id=>{
    const el=$('#'+id); if(el){el.oninput=renderProducts; el.onchange=renderProducts;}
  });
  if($('#newProductBtn')) $('#newProductBtn').onclick=prepareNewProductV105;
  if($('#cancelProduct')) $('#cancelProduct').onclick=resetProductForm;
  if($('#productBusinessUnit')) $('#productBusinessUnit').onchange=()=>{fillCategorySelect();};
}
const setBusinessFilterV105Base=setBusinessFilterV104;
setBusinessFilterV104=function(code){
  setBusinessFilterV105Base(code);
  setTimeout(()=>{bindInventoryV105(); renderProducts();},60);
};
window.setBusinessFilterV104=setBusinessFilterV104;
window.setBusinessFilterV102=setBusinessFilterV104;
const showViewV105Base=showView;
showView=function(id,btn){
  showViewV105Base(id,btn);
  if(id==='products') setTimeout(()=>{bindInventoryV105(); renderProducts();},70);
};
const loadAllV105Base=loadAll;
loadAll=async function(){
  await loadAllV105Base();
  bindInventoryV105();
  renderProducts();
};
(function bootV105(){
  const title=document.querySelector('title'); if(title) title.textContent='MM Comercial ERP V10.5';
  document.querySelector('.brand span') && (document.querySelector('.brand span').textContent='V10.5 Inventario');
  setTimeout(()=>{bindInventoryV105(); renderProducts();},300);
})();

/* ==========================================================
   V10.6 - Contexto real por unidad + códigos automáticos + etiquetas filtradas
   - El Maestro de Producto ya no deja escoger unidad manualmente.
   - Nuevo producto hereda la unidad activa del sistema.
   - Código interno se genera automáticamente por unidad/categoría.
   - Código fabricante y código proveedor quedan como referencias externas.
   - Centro de etiquetas respeta Ferretería/Librería/Todas.
   ========================================================== */
function selectedBusinessUnitObjectV106(){
  const code=selectedUnitCodeV104();
  if(code==='FER' || code==='LIB') return businessUnitByCodeV104(code);
  return null;
}
function requireConcreteBusinessUnitV106(){
  const u=selectedBusinessUnitObjectV106();
  if(!u){
    showToastV1043('Seleccioná MM Ferretería o MM Librería antes de crear un producto. En “Todas” solo se consulta, no se registra inventario nuevo.','warning');
    return null;
  }
  return u;
}
function categoryPrefixV106(categoryId){
  if(typeof categoryPrefixV9==='function') return categoryPrefixV9(categoryId);
  const c=(categories||[]).find(x=>String(x.id)===String(categoryId));
  const raw=String(c?.code || c?.name || 'GEN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z]/g,'');
  return (raw.slice(0,3)||'GEN').padEnd(3,'X');
}
function nextInternalCodeV106(categoryId, unit){
  const u=unit || selectedBusinessUnitObjectV106() || businessUnitByCodeV104('FER') || {code:'FER'};
  const code=String(u.code||'FER').toUpperCase();
  const cat=categoryPrefixV106(categoryId);
  const pref=`MM-${code}-${cat}`;
  const re=new RegExp(`^${pref.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}-(\\d{6})$`,'i');
  const max=(products||[]).reduce((m,p)=>{
    const match=String(p.internal_code||'').match(re);
    return match ? Math.max(m, Number(match[1]||0)) : m;
  },0);
  return `${pref}-${String(max+1).padStart(6,'0')}`;
}
function syncProductBusinessUnitLockV106(product){
  const select=$('#productBusinessUnit');
  if(!select) return;
  const unit = product ? (productBusinessUnitObjV104(product)||selectedBusinessUnitObjectV106()) : selectedBusinessUnitObjectV106();
  if(unit?.id) select.value=unit.id;
  select.disabled=true;
  select.required=false;
  select.classList.add('hidden-business-unit-select');
  let chip=$('#productBusinessUnitLock');
  if(!chip){
    chip=document.createElement('div');
    chip.id='productBusinessUnitLock';
    chip.className='business-unit-locked-card';
    select.insertAdjacentElement('afterend', chip);
  }
  const code=String(unit?.code||'ALL').toUpperCase();
  chip.innerHTML=`<small>Unidad de negocio</small><strong>${escapeHtmlV6(unit?.name||'Seleccioná una unidad')}</strong><span>${code==='LIB'?'Azul: Librería':'Naranja: Ferretería'}</span>`;
}
function updateInternalCodePreviewV106(product){
  let box=$('#internalCodePreviewV106');
  const categoryId=$('#categorySelect')?.value||product?.category_id||null;
  const unit=product ? productBusinessUnitObjV104(product) : selectedBusinessUnitObjectV106();
  const value=product?.internal_code || (unit ? nextInternalCodeV106(categoryId, unit) : 'Seleccioná unidad');
  if(!box){
    const grid=$('#productForm .product-form-section .formGrid');
    if(!grid) return;
    box=document.createElement('div');
    box.id='internalCodePreviewV106';
    box.className='internal-code-preview';
    grid.insertBefore(box, grid.firstChild);
  }
  box.innerHTML=`<small>Código interno automático</small><strong>${escapeHtmlV6(value)}</strong><span>${product?'Producto existente':'Se generará al guardar'}</span>`;
}
function prepareProductModalContextV106(product=null){
  fillBusinessUnitSelectsV104();
  syncProductBusinessUnitLockV106(product);
  updateInternalCodePreviewV106(product);
  const manu=$('#manufacturerCode'); if(manu) manu.placeholder='Código fabricante / modelo del producto';
  const supp=$('#supplierCode'); if(supp) supp.placeholder='Código del proveedor en factura / catálogo';
  const cat=$('#categorySelect');
  if(cat && !cat.dataset.v106Bound){
    cat.dataset.v106Bound='1';
    cat.addEventListener('change',()=>updateInternalCodePreviewV106($('#productId')?.value ? (products||[]).find(p=>String(p.id)===String($('#productId').value)) : null));
  }
}
const prepareNewProductV106Base = typeof prepareNewProductV105==='function' ? prepareNewProductV105 : null;
window.prepareNewProductV106=function(){
  if(!guardAdmin()) return;
  const u=requireConcreteBusinessUnitV106();
  if(!u) return;
  resetProductFormV1043Base();
  fillBusinessUnitSelectsV104();
  if($('#productBusinessUnit')) $('#productBusinessUnit').value=u.id;
  fillCategorySelect();
  updateUnitOptionsV102();
  prepareProductModalContextV106(null);
  const pill=document.querySelector('.version-pill'); if(pill) pill.textContent='V10.6';
  openProductModalV1043();
};
if($('#newProductBtn')) $('#newProductBtn').onclick=window.prepareNewProductV106;
window.editProduct=function(id){
  if(!guardAdmin()) return;
  const p=(products||[]).find(x=>String(x.id)===String(id)); if(!p) return;
  fillBusinessUnitSelectsV104();
  $('#productId').value=p.id;
  $('#supplierCode').value=p.supplier_code||'';
  $('#productName').value=p.name||'';
  $('#brand').value=p.brand||'';
  if($('#manufacturerCode')) $('#manufacturerCode').value=p.manufacturer_code||'';
  if($('#productAlias')) $('#productAlias').value=p.aliases||'';
  if($('#productBusinessUnit')) $('#productBusinessUnit').value=p.business_unit_id||productBusinessUnitObjV104(p)?.id||'';
  fillCategorySelect();
  $('#categorySelect').value=p.category_id||'';
  if($('#saleType')) $('#saleType').value=p.sale_type||inferSaleTypeFromUnitV102(p.unit_type)||'UNIDAD';
  updateUnitOptionsV102(p.unit_type||'UND');
  $('#purchasePrice').value=p.purchase_price||0;
  $('#profitMargin').value=p.allow_manual_price?'manual':String(Number(p.profit_margin||35));
  $('#salePrice').value=rawMoney(p.sale_price);
  $('#stock').value=p.stock||0;
  $('#minStock').value=p.min_stock||0;
  $('#maxStock').value=p.max_stock||0;
  $('#location').value=p.location||'';
  prepareProductModalContextV106(p);
  openProductModalV1043();
};
saveProduct=async function(e){
  e.preventDefault();
  if(!guardAdmin()) return;
  const isEdit=Boolean($('#productId').value);
  const existing=isEdit ? (products||[]).find(p=>String(p.id)===String($('#productId').value)) : null;
  const unit=isEdit ? productBusinessUnitObjV104(existing) : requireConcreteBusinessUnitV106();
  if(!unit?.id) return showToastV1043('No se pudo determinar la unidad de negocio del producto.','error');
  const m=$('#profitMargin').value;
  const manual=m==='manual';
  const cost=Number($('#purchasePrice').value||0);
  const sale=manual?Number($('#salePrice').value||0):Math.ceil(cost*(1+Number(m)/100));
  const categoryId=$('#categorySelect').value||null;
  const payload={
    supplier_code:$('#supplierCode').value||null,
    manufacturer_code:$('#manufacturerCode')?.value||null,
    aliases:$('#productAlias')?.value||null,
    name:$('#productName').value,
    category_id:categoryId,
    brand:$('#brand').value||null,
    unit_type:$('#unitType').value,
    purchase_price:cost,
    profit_margin:manual?0:Number(m),
    allow_manual_price:manual,
    sale_price:sale,
    stock:Number($('#stock').value||0),
    min_stock:Number($('#minStock').value||0),
    max_stock:Number($('#maxStock').value||0),
    location:$('#location').value||null,
    last_cost_update:new Date().toISOString(),
    business_unit_id:unit.id,
    sale_type:$('#saleType')?.value||'UNIDAD',
    allows_decimal:isDecimalUnitV102($('#unitType').value)
  };
  let r;
  if(isEdit){
    r=await sb.from('products').update(payload).eq('id',$('#productId').value);
  }else{
    const code=nextInternalCodeV106(categoryId, unit);
    r=await sb.from('products').insert({...payload,internal_code:code,barcode:code,status:'ACTIVE'});
  }
  if(r.error) return showToastV1043(r.error.message,'error');
  showToastV1043(isEdit?'Producto actualizado.':'Producto creado con código interno automático.','success');
  resetProductForm();
  await loadAll();
};
if($('#productForm')) $('#productForm').onsubmit=saveProduct;

function labelRowsVisibleByBusinessUnitV106(){
  return (products||[]).filter(matchesBusinessUnitV104);
}
labelFilterRowsV91=function(){
  const q=normV104($('#barcodeSearch')?.value||'');
  const cat=$('#labelCategoryFilter')?.value || 'ALL';
  const brand=$('#labelBrandFilter')?.value || 'ALL';
  const printed=$('#labelPrintedFilter')?.value || 'ALL';
  return labelRowsVisibleByBusinessUnitV106().filter(p=>{
    const catName=categoryObjV104(p)?.name || 'General';
    const brandName=p.brand || 'Sin marca';
    const hasPrint=!!labelPrintedInfoV91(p);
    const text=normV104([p.name,p.clean_name,p.internal_code,p.barcode,p.supplier_code,p.manufacturer_code,p.aliases,p.brand,catName,productBusinessUnitObjV104(p).name].join(' '));
    return (!q || text.includes(q)) &&
      (cat==='ALL' || catName===cat) &&
      (brand==='ALL' || brandName===brand) &&
      (printed==='ALL' || (printed==='PRINTED' && hasPrint) || (printed==='NOT_PRINTED' && !hasPrint));
  }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
};
fillLabelFiltersV91=function(){
  const visible=labelRowsVisibleByBusinessUnitV106();
  const catSel=$('#labelCategoryFilter');
  if(catSel){
    const current=catSel.value||'ALL';
    const cats=[...new Set(visible.map(p=>categoryObjV104(p)?.name || 'General'))].sort();
    catSel.innerHTML='<option value="ALL">Todas</option>'+cats.map(c=>`<option value="${escapeHtmlV6(c)}">${escapeHtmlV6(c)}</option>`).join('');
    catSel.value=[...catSel.options].some(o=>o.value===current)?current:'ALL';
  }
  const brandSel=$('#labelBrandFilter');
  if(brandSel){
    const current=brandSel.value||'ALL';
    const brands=[...new Set(visible.map(p=>p.brand||'Sin marca'))].sort();
    brandSel.innerHTML='<option value="ALL">Todas</option>'+brands.map(b=>`<option value="${escapeHtmlV6(b)}">${escapeHtmlV6(b)}</option>`).join('');
    brandSel.value=[...brandSel.options].some(o=>o.value===current)?current:'ALL';
  }
};
selectedLabelProductV91=function(){
  const rows=labelFilterRowsV91();
  return rows.find(p=>String(p.id)===String(labelSelectedProductIdV91)) || rows[0] || null;
};
const renderLabelCenterV106Base=renderLabelCenterV91;
renderLabelCenterV91=function(){
  const current=selectedLabelProductV91();
  if(current) labelSelectedProductIdV91=current.id;
  renderLabelCenterV106Base();
  const title=document.querySelector('#labelTabInventory .section-title, #labelTabInventory h3');
  const visibleName=selectedUnitCodeV104()==='ALL'?'Todas las unidades':(selectedUnitCodeV104()==='LIB'?'MM Librería':'MM Ferretería');
  if(title && !title.dataset.v106){ title.dataset.v106='1'; }
  const info=document.querySelector('#labelTabInventory .small-muted-v106') || document.createElement('div');
  info.className='small-muted-v106';
  info.textContent=`Mostrando productos de: ${visibleName}`;
  const inv=$('#labelTabInventory'); if(inv && !info.parentElement) inv.insertBefore(info, inv.children[1]||null);
};
const setBusinessFilterV106Base=setBusinessFilterV104;
setBusinessFilterV104=function(code){
  labelSelectedProductIdV91=null;
  setBusinessFilterV106Base(code);
  setTimeout(()=>{renderLabelCenterV91(); renderLabels(); renderProducts();},80);
};
window.setBusinessFilterV104=setBusinessFilterV104;
window.setBusinessFilterV102=setBusinessFilterV104;
const showViewV106Base=showView;
showView=function(id,btn){
  showViewV106Base(id,btn);
  if(id==='barcode') setTimeout(()=>{labelSelectedProductIdV91=null; renderLabelCenterV91(); renderLabels();},80);
  if(id==='products') setTimeout(()=>{prepareProductModalContextV106(null);},120);
};
(function bootV106(){
  const title=document.querySelector('title'); if(title) title.textContent='MM Comercial ERP V10.6';
  document.querySelector('.brand span') && (document.querySelector('.brand span').textContent='V10.6 Multiunidad');
  const pill=document.querySelector('.version-pill'); if(pill) pill.textContent='V10.6';
  setTimeout(()=>{
    if($('#newProductBtn')) $('#newProductBtn').onclick=window.prepareNewProductV106;
    prepareProductModalContextV106(null);
    renderLabelCenterV91();
  },500);
})();

/* ==========================================================
   V10.7 - Estabilidad operativa
   - Unidad de negocio siempre usa UUID real, no textos FERRETERIA/LIBRERIA.
   - POS / Inventario / Etiquetas filtran por unidad activa real.
   - Impresión de etiquetas en ventana limpia para evitar hoja en blanco.
   ========================================================== */
const KNOWN_BUSINESS_UNITS_V107 = {
  FER: {id:'fe4ba5f4-9b17-4938-aa7e-bcbde8818dde', code:'FER', name:'MM Ferretería', color:'#F97316', status:'ACTIVE'},
  LIB: {id:'d9d8bd53-34ce-425c-bcdb-098f29889aab', code:'LIB', name:'MM Librería', color:'#3B82F6', status:'ACTIVE'}
};
function mergeKnownBusinessUnitsV107(){
  const list=Array.isArray(businessUnitsV10)?businessUnitsV10:[];
  ['FER','LIB'].forEach(code=>{
    const known=KNOWN_BUSINESS_UNITS_V107[code];
    const found=list.find(u=>String(u.code).toUpperCase()===code || String(u.id)===known.id);
    if(found){Object.assign(found,{code:found.code||known.code,name:found.name||known.name,color:found.color||known.color,status:found.status||known.status});}
    else list.push({...known});
  });
  businessUnitsV10=list;
  return list;
}
fallbackBusinessUnitsV10=function(){ return Object.values(KNOWN_BUSINESS_UNITS_V107).map(x=>({...x})); };
businessUnitByCodeV104=function(code){
  mergeKnownBusinessUnitsV107();
  const c=String(code||'FER').toUpperCase();
  return (businessUnitsV10||[]).find(u=>String(u.code||'').toUpperCase()===c)
    || KNOWN_BUSINESS_UNITS_V107[c]
    || KNOWN_BUSINESS_UNITS_V107.FER;
};
function businessUnitByAnyV107(value){
  mergeKnownBusinessUnitsV107();
  const raw=String(value||'').trim();
  const n=normV104(raw);
  if(!raw || raw==='ALL') return null;
  return (businessUnitsV10||[]).find(u=>
    String(u.id)===raw ||
    String(u.code||'').toUpperCase()===raw.toUpperCase() ||
    normV104(u.name)===n ||
    (n.includes('fer') && String(u.code).toUpperCase()==='FER') ||
    (n.includes('lib') && String(u.code).toUpperCase()==='LIB')
  ) || null;
}
selectedUnitCodeV104=function(){
  const raw=String(selectedBusinessUnitV10 || localStorage.getItem('mm_business_unit') || 'ALL');
  if(raw==='ALL') return 'ALL';
  const u=businessUnitByAnyV107(raw);
  if(u?.code) return String(u.code).toUpperCase();
  const n=normV104(raw);
  if(n.includes('lib')) return 'LIB';
  if(n.includes('fer')) return 'FER';
  return raw.toUpperCase()==='LIB'?'LIB':'FER';
};
productBusinessUnitCodeV104=function(p){
  mergeKnownBusinessUnitsV107();
  if(p?.business_units?.code) return String(p.business_units.code).toUpperCase();
  if(p?.business_unit?.code) return String(p.business_unit.code).toUpperCase();
  if(p?.business_unit_code) return String(p.business_unit_code).toUpperCase();
  const directId=p?.business_unit_id;
  if(directId){
    const u=businessUnitByAnyV107(directId);
    if(u?.code) return String(u.code).toUpperCase();
  }
  const c=categoryObjV104(p);
  if(c?.business_units?.code) return String(c.business_units.code).toUpperCase();
  if(c?.business_unit_id){
    const u=businessUnitByAnyV107(c.business_unit_id);
    if(u?.code) return String(u.code).toUpperCase();
  }
  return inferUnitCodeFromTextV104(p);
};
productBusinessUnitObjV104=function(p){ return businessUnitByCodeV104(productBusinessUnitCodeV104(p)); };
matchesBusinessUnitV104=function(p){
  const selected=selectedUnitCodeV104();
  return selected==='ALL' || productBusinessUnitCodeV104(p)===selected;
};
function selectedBusinessUnitObjectV107(){
  const code=selectedUnitCodeV104();
  if(code==='FER'||code==='LIB') return businessUnitByCodeV104(code);
  return null;
}
selectedBusinessUnitObjectV106=selectedBusinessUnitObjectV107;
function defaultProductBusinessUnitIdV107(){
  const u=selectedBusinessUnitObjectV107() || businessUnitByCodeV104('FER');
  return u?.id || KNOWN_BUSINESS_UNITS_V107.FER.id;
}
defaultProductBusinessUnitIdV105=defaultProductBusinessUnitIdV107;
function setBusinessFilterV107(code){
  const raw=String(code||'ALL');
  const u=businessUnitByAnyV107(raw);
  selectedBusinessUnitV10 = raw==='ALL' ? 'ALL' : (u?.code || selectedUnitCodeV104());
  localStorage.setItem('mm_business_unit', selectedBusinessUnitV10);
  selectedCategory='ALL';
  labelSelectedProductIdV91=null;
  renderBusinessSwitchV104();
  fillCategorySelect();
  renderCategoryTabs();
  renderDashboard(); renderPOS(); renderProducts(); renderLabelCenterV91(); renderLabels(); renderProfitability(); renderCart();
}
setBusinessFilterV104=setBusinessFilterV107;
window.setBusinessFilterV104=setBusinessFilterV107;
window.setBusinessFilterV102=setBusinessFilterV107;
fillBusinessUnitSelectsV104=function(){
  const units=mergeKnownBusinessUnitsV107();
  const selected=selectedUnitCodeV104();
  const prod=$('#productBusinessUnit');
  if(prod){
    prod.innerHTML=units.map(u=>`<option value="${escapeHtmlV6(u.id)}">${escapeHtmlV6(u.name)}</option>`).join('');
    const active=selectedBusinessUnitObjectV107();
    if(active?.id) prod.value=active.id;
  }
  const sel=$('#businessUnitFilter');
  if(sel){
    sel.innerHTML='<option value="ALL">Todas las unidades</option>'+units.map(u=>`<option value="${escapeHtmlV6(u.code)}">${escapeHtmlV6(u.name)}</option>`).join('');
    sel.value=selected;
    sel.onchange=()=>setBusinessFilterV107(sel.value);
  }
};
fillBusinessUnitSelectsV102=fillBusinessUnitSelectsV104;
fillBusinessUnitSelectsV10=fillBusinessUnitSelectsV104;
renderBusinessSwitchV104=function(){
  let host=document.querySelector('.content') || document.body;
  let bar=document.getElementById('businessSwitchbar');
  if(!bar){
    bar=document.createElement('div'); bar.id='businessSwitchbar'; bar.className='business-switchbar';
    const title=document.getElementById('title');
    (title?.parentElement||host).insertBefore(bar,(title?.parentElement||host).children[1]||null);
  }
  const selected=selectedUnitCodeV104();
  bar.innerHTML=`<strong>MM Comercial</strong>
    <button class="${selected==='ALL'?'active':''}" onclick="setBusinessFilterV107('ALL')">Todas</button>
    <button class="${selected==='FER'?'active':''}" onclick="setBusinessFilterV107('FER')">Ferretería</button>
    <button class="${selected==='LIB'?'active':''}" onclick="setBusinessFilterV107('LIB')">Librería</button>
    <small>Una sola factura, inventario y reportes separados por unidad.</small>`;
  const filter=$('#businessUnitFilter'); if(filter) filter.value=selected;
};
window.setBusinessFilterV107=setBusinessFilterV107;
renderBusinessSwitchV102=renderBusinessSwitchV104;

function categoryVisibleInCurrentUnitV107(c){
  const selected=selectedUnitCodeV104();
  if(selected==='ALL') return true;
  const hasProducts=(products||[]).some(p=>matchesBusinessUnitV104(p) && String(p.category_id)===String(c.id));
  if(hasProducts) return true;
  return categoryBusinessUnitCodeV104(c)===selected;
}
renderCategoryTabs=function(){
  const cats=(categories||[]).filter(categoryVisibleInCurrentUnitV107);
  const tabs=['ALL',...cats.map(c=>c.name)];
  const el=$('#categoryTabs');
  if(el) el.innerHTML=tabs.map(t=>`<button class="${selectedCategory===t?'active':''}" onclick="selectCategory('${String(t).replaceAll("'","\\'")}')">${t==='ALL'?'Todos':escapeHtmlV6(t)}</button>`).join('');
};
fillCategorySelect=function(){
  fillBusinessUnitSelectsV104();
  const cats=(categories||[]).filter(categoryVisibleInCurrentUnitV107);
  if($('#categorySelect')) $('#categorySelect').innerHTML='<option value="">Sin categoría</option>'+cats.map(c=>`<option value="${escapeHtmlV6(c.id)}">${escapeHtmlV6(c.name)}</option>`).join('');
  if($('#inventoryCategoryFilter')) $('#inventoryCategoryFilter').innerHTML='<option value="ALL">Todas las categorías</option>'+cats.map(c=>`<option value="${escapeHtmlV6(c.id)}">${escapeHtmlV6(c.name)}</option>`).join('');
};

function syncProductBusinessUnitLockV107(product){
  const select=$('#productBusinessUnit'); if(!select) return;
  const unit=product ? productBusinessUnitObjV104(product) : selectedBusinessUnitObjectV107();
  if(unit?.id) select.value=unit.id;
  select.disabled=true;
  select.classList.add('hidden-business-unit-select');
  let chip=$('#productBusinessUnitLock');
  if(!chip){ chip=document.createElement('div'); chip.id='productBusinessUnitLock'; chip.className='business-unit-locked-card'; select.insertAdjacentElement('afterend',chip); }
  const code=String(unit?.code||'ALL').toUpperCase();
  chip.innerHTML=`<small>Unidad de negocio</small><strong>${escapeHtmlV6(unit?.name||'Seleccioná Ferretería o Librería')}</strong><span>${code==='LIB'?'Azul: Librería':'Naranja: Ferretería'}</span>`;
}
syncProductBusinessUnitLockV106=syncProductBusinessUnitLockV107;
window.prepareNewProductV106=function(){
  if(!guardAdmin()) return;
  const u=selectedBusinessUnitObjectV107();
  if(!u) return showToastV1043('Seleccioná MM Ferretería o MM Librería antes de crear un producto. En “Todas” no se registra inventario nuevo.','warning');
  resetProductFormV1043Base();
  fillBusinessUnitSelectsV104();
  if($('#productBusinessUnit')) $('#productBusinessUnit').value=u.id;
  fillCategorySelect(); updateUnitOptionsV102(); prepareProductModalContextV106(null);
  const pill=document.querySelector('.version-pill'); if(pill) pill.textContent='V10.7';
  openProductModalV1043();
};
window.editProduct=function(id){
  if(!guardAdmin()) return;
  const p=(products||[]).find(x=>String(x.id)===String(id)); if(!p) return;
  fillBusinessUnitSelectsV104();
  $('#productId').value=p.id; $('#supplierCode').value=p.supplier_code||''; $('#productName').value=p.name||''; $('#brand').value=p.brand||'';
  if($('#manufacturerCode')) $('#manufacturerCode').value=p.manufacturer_code||'';
  if($('#productAlias')) $('#productAlias').value=p.aliases||'';
  if($('#productBusinessUnit')) $('#productBusinessUnit').value=productBusinessUnitObjV104(p)?.id||p.business_unit_id||'';
  fillCategorySelect(); $('#categorySelect').value=p.category_id||'';
  if($('#saleType')) $('#saleType').value=p.sale_type||inferSaleTypeFromUnitV102(p.unit_type)||'UNIDAD';
  updateUnitOptionsV102(p.unit_type||'UND');
  $('#purchasePrice').value=p.purchase_price||0; $('#profitMargin').value=p.allow_manual_price?'manual':String(Number(p.profit_margin||35));
  $('#salePrice').value=rawMoney(p.sale_price); $('#stock').value=p.stock||0; $('#minStock').value=p.min_stock||0; $('#maxStock').value=p.max_stock||0; $('#location').value=p.location||'';
  prepareProductModalContextV106(p); openProductModalV1043();
};
saveProduct=async function(e){
  e.preventDefault(); if(!guardAdmin()) return;
  const isEdit=Boolean($('#productId').value);
  const existing=isEdit ? (products||[]).find(p=>String(p.id)===String($('#productId').value)) : null;
  const unit=isEdit ? productBusinessUnitObjV104(existing) : selectedBusinessUnitObjectV107();
  if(!unit?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(unit.id))){
    return showToastV1043('La unidad de negocio no tiene UUID válido. Recargá la página y seleccioná Ferretería o Librería.','error');
  }
  const m=$('#profitMargin').value, manual=m==='manual', cost=Number($('#purchasePrice').value||0), sale=manual?Number($('#salePrice').value||0):Math.ceil(cost*(1+Number(m)/100));
  const categoryId=$('#categorySelect').value||null;
  const payload={
    supplier_code:$('#supplierCode').value||null, manufacturer_code:$('#manufacturerCode')?.value||null, aliases:$('#productAlias')?.value||null,
    name:$('#productName').value, category_id:categoryId, brand:$('#brand').value||null, unit_type:$('#unitType').value,
    purchase_price:cost, profit_margin:manual?0:Number(m), allow_manual_price:manual, sale_price:sale,
    stock:Number($('#stock').value||0), min_stock:Number($('#minStock').value||0), max_stock:Number($('#maxStock').value||0),
    location:$('#location').value||null, last_cost_update:new Date().toISOString(), business_unit_id:unit.id,
    sale_type:$('#saleType')?.value||'UNIDAD', allows_decimal:isDecimalUnitV102($('#unitType').value)
  };
  let r;
  if(isEdit) r=await sb.from('products').update(payload).eq('id',$('#productId').value);
  else { const code=nextInternalCodeV106(categoryId,unit); r=await sb.from('products').insert({...payload,internal_code:code,barcode:code,status:'ACTIVE'}); }
  if(r.error) return showToastV1043(r.error.message,'error');
  showToastV1043(isEdit?'Producto actualizado.':'Producto creado con código interno automático.','success');
  resetProductForm(); await loadAll();
};
if($('#productForm')) $('#productForm').onsubmit=saveProduct;

function labelRowsVisibleByBusinessUnitV107(){ return (products||[]).filter(matchesBusinessUnitV104); }
labelRowsVisibleByBusinessUnitV106=labelRowsVisibleByBusinessUnitV107;
labelFilterRowsV91=function(){
  const q=normV104($('#barcodeSearch')?.value||'');
  const cat=$('#labelCategoryFilter')?.value || 'ALL';
  const brand=$('#labelBrandFilter')?.value || 'ALL';
  const printed=$('#labelPrintedFilter')?.value || 'ALL';
  return labelRowsVisibleByBusinessUnitV107().filter(p=>{
    const catName=categoryObjV104(p)?.name || 'General';
    const brandName=p.brand || 'Sin marca';
    const hasPrint=!!labelPrintedInfoV91(p);
    const text=normV104([p.name,p.clean_name,p.internal_code,p.barcode,p.supplier_code,p.manufacturer_code,p.aliases,p.brand,catName,productBusinessUnitObjV104(p).name].join(' '));
    return (!q || text.includes(q)) && (cat==='ALL'||catName===cat) && (brand==='ALL'||brandName===brand) && (printed==='ALL'||(printed==='PRINTED'&&hasPrint)||(printed==='NOT_PRINTED'&&!hasPrint));
  }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
};
fillLabelFiltersV91=function(){
  const visible=labelRowsVisibleByBusinessUnitV107();
  const catSel=$('#labelCategoryFilter');
  if(catSel){const current=catSel.value||'ALL'; const cats=[...new Set(visible.map(p=>categoryObjV104(p)?.name||'General'))].sort(); catSel.innerHTML='<option value="ALL">Todas</option>'+cats.map(c=>`<option value="${escapeHtmlV6(c)}">${escapeHtmlV6(c)}</option>`).join(''); catSel.value=[...catSel.options].some(o=>o.value===current)?current:'ALL';}
  const brandSel=$('#labelBrandFilter');
  if(brandSel){const current=brandSel.value||'ALL'; const brands=[...new Set(visible.map(p=>p.brand||'Sin marca'))].sort(); brandSel.innerHTML='<option value="ALL">Todas</option>'+brands.map(b=>`<option value="${escapeHtmlV6(b)}">${escapeHtmlV6(b)}</option>`).join(''); brandSel.value=[...brandSel.options].some(o=>o.value===current)?current:'ALL';}
};
selectedLabelProductV91=function(){ const rows=labelFilterRowsV91(); return rows.find(p=>String(p.id)===String(labelSelectedProductIdV91)) || rows[0] || null; };

function labelHtmlForPrintV107(){
  renderLabels();
  const html=$('#labelPreview')?.innerHTML || '';
  if(!html || html.includes('label-empty')) return '';
  return html;
}
function printLabelsV107(){
  const p=selectedLabelProductV91();
  const html=labelHtmlForPrintV107();
  if(!p || !html) return showToastV1043('Seleccioná un producto para imprimir etiqueta.','warning');
  const qty=Math.max(1,Math.min(200,Number($('#labelQty')?.value||1)));
  if(typeof saveLabelPrintLogV91==='function') saveLabelPrintLogV91(p.id,qty);
  const format=$('#labelFormat')?.value || 'thermal_50x30';
  const pageSize = format==='shelf_70x40' ? '70mm 40mm' : (format==='sheet_a4' ? 'A4' : '50mm 30mm');
  const css=`
    @page{size:${pageSize};margin:0;}
    *{box-sizing:border-box} body{margin:0;background:white;color:#111827;font-family:Arial,Helvetica,sans-serif;}
    #printRoot{display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;justify-content:flex-start;}
    .thermal-label{box-sizing:border-box;overflow:hidden;background:#fff!important;color:#111827!important;border:0!important;display:grid!important;grid-template-rows:auto 1fr auto!important;align-items:center!important;justify-items:stretch!important;gap:1.5mm!important;page-break-inside:avoid;break-inside:avoid;}
    .label-50x30{width:50mm;height:30mm;padding:2.5mm 3mm}.label-70x40{width:70mm;height:40mm;padding:4mm}.sheet-a4-label{width:66mm;height:33mm;padding:3mm;border:1px dashed #bbb!important;margin:2mm;}
    .label-name{width:100%;max-height:9mm;overflow:hidden;font-size:10.5px;line-height:1.15;font-weight:900;text-align:center;text-transform:uppercase;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
    .label-70x40 .label-name{font-size:12px;max-height:11mm}.barcode-wrap{width:100%;overflow:hidden}.barcode-svg{width:100%;height:11mm;display:block}.label-70x40 .barcode-svg{height:14mm}.label-footer{display:grid;grid-template-columns:1fr auto;align-items:end;gap:2mm;width:100%;}.label-sku{font-size:8px;font-weight:800;color:#111827;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.label-price{font-size:13px;line-height:1;font-weight:950;color:#000;white-space:nowrap;text-align:right}.label-70x40 .label-price{font-size:17px}`;
  const win=window.open('','mm_label_print','width=420,height=360');
  if(!win) return showToastV1043('El navegador bloqueó la ventana de impresión. Permití pop-ups para este sitio.','error');
  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta MM Comercial</title><style>${css}</style></head><body><div id="printRoot">${html}</div></body></html>`);
  win.document.close();
  const run=()=>{try{win.focus();win.print();setTimeout(()=>win.close(),450);}catch(e){console.error(e);}};
  setTimeout(run,350);
  setTimeout(()=>{renderLabelCenterV91();renderLabels();},500);
}
printLabelsV9=printLabelsV107;
if($('#printLabels')) $('#printLabels').onclick=printLabelsV107;
if($('#printSelectedLabels')) $('#printSelectedLabels').onclick=printLabelsV107;

const loadAllV107Base=loadAll;
loadAll=async function(){
  await loadAllV107Base();
  mergeKnownBusinessUnitsV107(); fillBusinessUnitSelectsV104(); renderBusinessSwitchV104();
  renderCategoryTabs(); renderPOS(); renderProducts(); renderLabelCenterV91(); renderLabels();
};
(function bootV107(){
  mergeKnownBusinessUnitsV107();
  const title=document.querySelector('title'); if(title) title.textContent='MM Comercial ERP V10.7';
  document.querySelector('.brand span') && (document.querySelector('.brand span').textContent='V10.7 Estable');
  const pill=document.querySelector('.version-pill'); if(pill) pill.textContent='V10.7';
  setTimeout(()=>{
    mergeKnownBusinessUnitsV107(); fillBusinessUnitSelectsV104(); renderBusinessSwitchV104(); renderCategoryTabs();
    if($('#newProductBtn')) $('#newProductBtn').onclick=window.prepareNewProductV106;
    if($('#printLabels')) $('#printLabels').onclick=printLabelsV107;
    if($('#printSelectedLabels')) $('#printSelectedLabels').onclick=printLabelsV107;
  },700);
})();


/* ==========================================================
   V11.1 MESA DE CAMBIO + CAJA BIMONEDA
   - Compra USD y Venta USD funcionales.
   - Operaciones guardadas en exchange_operations.
   - Arqueo C$ y US$ incluye mesa de cambio.
   ========================================================== */
let exchangeOperationsV111 = [];
const EXCHANGE_DEFAULT_REFERENCE_RATE_V111 = Number(cfg.EXCHANGE_REFERENCE_RATE || localStorage.getItem('mm_exchange_reference_rate') || 36.6243);

function openCashSessionsV111(){ return (cashSessions||[]).filter(s=>String(s.status||'').toUpperCase()==='OPEN'); }
function exchangeOpsForSessionV111(sessionId){ return (exchangeOperationsV111||[]).filter(x=>String(x.cash_session_id||'')===String(sessionId) && String(x.status||'COMPLETED').toUpperCase()!=='VOID'); }
function exchangeSummaryV111(sessionId){
  const ops=exchangeOpsForSessionV111(sessionId);
  return ops.reduce((a,o)=>{
    const type=String(o.operation_type||'').toUpperCase();
    const usd=Number(o.amount_usd||0);
    const nio=Number(o.amount_nio||0);
    const profit=Number(o.profit_nio||0);
    if(type==='SELL_USD'){
      a.sellUsd += usd; a.nioIn += nio; a.usdOut += usd; a.profit += profit;
    }else if(type==='BUY_USD'){
      a.buyUsd += usd; a.usdIn += usd; a.nioOut += nio;
    }
    a.count += 1; a.volumeNio += nio;
    return a;
  },{count:0,sellUsd:0,buyUsd:0,nioIn:0,nioOut:0,usdIn:0,usdOut:0,profit:0,volumeNio:0});
}
function exchangeExpectedNioDeltaV111(sessionId){ const s=exchangeSummaryV111(sessionId); return s.nioIn - s.nioOut; }
function exchangeExpectedUsdDeltaV111(sessionId){ const s=exchangeSummaryV111(sessionId); return s.usdIn - s.usdOut; }
function expectedCashUsdV111(s){
  const stored=s.expected_cash_usd;
  if(String(s.status||'').toUpperCase()==='CLOSED' && stored!==undefined && stored!==null) return Number(stored);
  return Number(s.opening_cash_usd||0) + exchangeExpectedUsdDeltaV111(s.id);
}
const expectedCashNioV111Base = expectedCashNioV83;
expectedCashNioV83 = function(s){
  return expectedCashNioV111Base(s) + exchangeExpectedNioDeltaV111(s.id);
};

function fillExchangeSessionSelectV111(){
  const selects=['exchangeCashSession','closeCashSession','activeCashBox'];
  const open=openCashSessionsV111();
  const opts=open.map(s=>`<option value="${escapeHtmlV6(s.id)}">${escapeHtmlV6(s.box_name||'Caja')} · ${escapeHtmlV6(s.cashier_name||'')}</option>`).join('');
  const ex=$('#exchangeCashSession');
  if(ex){
    const current=ex.value || $('#activeCashBox')?.value || localStorage.getItem('mm_cash_session') || '';
    ex.innerHTML=open.length?opts:'<option value="">No hay cajas abiertas</option>';
    if([...ex.options].some(o=>o.value===current)) ex.value=current;
  }
}
function exchangeTypeLabelV111(t){ return String(t).toUpperCase()==='BUY_USD'?'Compra USD':'Venta USD'; }
function exchangePreviewV111(){
  const type=$('#exchangeType')?.value || 'SELL_USD';
  const usd=Number($('#exchangeUsdAmount')?.value||0);
  const rate=Number($('#exchangeRate')?.value||0);
  const ref=Number($('#exchangeReferenceRate')?.value||EXCHANGE_DEFAULT_REFERENCE_RATE_V111);
  const nio=usd*rate;
  const profit=type==='SELL_USD'?usd*(rate-ref):0;
  if($('#exchangeNioAmount')) $('#exchangeNioAmount').value = nio?Math.ceil(nio):'';
  const box=$('#exchangePreviewBox'); if(!box) return;
  const rule=type==='SELL_USD'
    ? `<b>Vender USD:</b> entra ${money(nio)} y salen US$ ${usd.toFixed(2)}. Utilidad estimada: ${money(profit)}.`
    : `<b>Comprar USD:</b> entran US$ ${usd.toFixed(2)} y salen ${money(nio)}.`;
  box.innerHTML = usd&&rate ? rule : 'Completa monto y tasa para ver el impacto de caja.';
}
function renderExchangeV111(){
  fillExchangeSessionSelectV111();
  const rate=$('#exchangeReferenceRate'); if(rate && !rate.value) rate.value=EXCHANGE_DEFAULT_REFERENCE_RATE_V111;
  exchangePreviewV111();
  const selectedSession=$('#exchangeCashSession')?.value || $('#activeCashBox')?.value || '';
  const allOps=(exchangeOperationsV111||[]).slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const visible=selectedSession ? allOps.filter(o=>String(o.cash_session_id||'')===String(selectedSession)) : allOps;
  const total=visible.reduce((a,o)=>a+Number(o.amount_nio||0),0);
  const profit=visible.reduce((a,o)=>a+Number(o.profit_nio||0),0);
  const cards=$('#exchangeSummaryCards');
  if(cards) cards.innerHTML=`
    <article><small>Operaciones</small><b>${visible.length}</b><span>Mesa de cambio</span></article>
    <article><small>Volumen C$</small><b>${money(total)}</b><span>Compras + ventas</span></article>
    <article><small>Utilidad estimada</small><b>${money(profit)}</b><span>Diferencial de venta USD</span></article>`;
  const table=$('#exchangeTable');
  if(table) table.innerHTML='<tr><th>Fecha</th><th>Caja</th><th>Tipo</th><th>US$</th><th>Tasa</th><th>Total C$</th><th>Utilidad</th><th>Cliente</th></tr>'+visible.map(o=>{
    const s=(cashSessions||[]).find(x=>String(x.id)===String(o.cash_session_id));
    return `<tr><td>${new Date(o.created_at||Date.now()).toLocaleString('es-NI')}</td><td>${escapeHtmlV6(s?.box_name||'Caja')}</td><td><span class="tag ${String(o.operation_type).toUpperCase()==='SELL_USD'?'green':'blue'}">${exchangeTypeLabelV111(o.operation_type)}</span></td><td>US$ ${Number(o.amount_usd||0).toFixed(2)}</td><td>${Number(o.rate||0).toFixed(4)}</td><td>${money(o.amount_nio)}</td><td>${money(o.profit_nio||0)}</td><td>${escapeHtmlV6(o.customer_name||'')}</td></tr>`;
  }).join('') || '<tr><td colspan="8">Sin operaciones registradas</td></tr>';
}
async function submitExchangeV111(e){
  e.preventDefault();
  const sessionId=$('#exchangeCashSession')?.value || $('#activeCashBox')?.value;
  if(!sessionId) return showToastV1043('Debes abrir o seleccionar una caja antes de operar Mesa de Cambio. El dinero también necesita dirección postal.','warning');
  const type=$('#exchangeType')?.value || 'SELL_USD';
  const usd=Number($('#exchangeUsdAmount')?.value||0);
  const rate=Number($('#exchangeRate')?.value||0);
  const ref=Number($('#exchangeReferenceRate')?.value||EXCHANGE_DEFAULT_REFERENCE_RATE_V111);
  if(usd<=0 || rate<=0) return showToastV1043('Monto y tasa son obligatorios. Sin números, solo tenemos literatura.','warning');
  const session=(cashSessions||[]).find(s=>String(s.id)===String(sessionId));
  if(!session || String(session.status).toUpperCase()!=='OPEN') return showToastV1043('La caja seleccionada no está abierta.','error');
  const nio=Number((usd*rate).toFixed(2));
  const profit=type==='SELL_USD'?Number((usd*(rate-ref)).toFixed(2)):0;
  const payload={
    cash_session_id:sessionId,
    operation_type:type,
    currency_from:type==='SELL_USD'?'NIO':'USD',
    currency_to:type==='SELL_USD'?'USD':'NIO',
    amount_usd:usd,
    rate:rate,
    amount_nio:nio,
    reference_rate:ref,
    profit_nio:profit,
    customer_name:$('#exchangeCustomer')?.value||null,
    reference:$('#exchangeReference')?.value||null,
    notes:$('#exchangeNotes')?.value||null,
    status:'COMPLETED',
    created_at:new Date().toISOString()
  };
  const r=await sb.from('exchange_operations').insert(payload).select().single();
  if(r.error) return showToastV1043('No se pudo registrar Mesa de Cambio: '+r.error.message,'error');
  showToastV1043('Operación de Mesa de Cambio registrada y lista para arqueo.','success');
  $('#exchangeForm')?.reset();
  if($('#exchangeReferenceRate')) $('#exchangeReferenceRate').value=ref;
  exchangeOperationsV111.unshift(r.data||payload);
  renderExchangeV111(); updateClosingCashSummaryV84(); renderCash(); renderDashboard();
}
function bindExchangeV111(){
  if($('#exchangeForm')) $('#exchangeForm').onsubmit=submitExchangeV111;
  ['exchangeType','exchangeUsdAmount','exchangeRate','exchangeReferenceRate','exchangeCashSession'].forEach(id=>{const el=$('#'+id); if(el){el.oninput=exchangePreviewV111; el.onchange=()=>{exchangePreviewV111(); renderExchangeV111();};}});
}
const showViewV111Base=showView;
showView=function(id,btn){
  showViewV111Base(id,btn);
  if(id==='exchange') renderExchangeV111();
  if(id==='cash'){renderCash(); updateClosingCashSummaryV84();}
};
const loadAllV111Base=loadAll;
loadAll=async function(){
  await loadAllV111Base();
  const r=await sb.from('exchange_operations').select('*').order('created_at',{ascending:false});
  if(r.error){ console.warn('exchange_operations no disponible. Ejecuta supabase/schema_v11_1_mesa_cambio.sql', r.error); exchangeOperationsV111=[]; }
  else exchangeOperationsV111=r.data||[];
  fillExchangeSessionSelectV111(); renderExchangeV111(); updateClosingCashSummaryV84(); renderCash(); renderDashboard();
};

updateClosingCashSummaryV84=function(){
  const box=$('#closingCashSummary'); if(!box) return;
  const id=$('#closeCashSession')?.value; const s=(cashSessions||[]).find(x=>String(x.id)===String(id));
  if(!s){ box.innerHTML='<div class="closing-summary-title">Cuadre automático</div><div class="closing-summary-empty">Selecciona una caja abierta para calcular el cuadre.</div>'; return; }
  const summary=cashSessionSalesV83(s.id);
  const ex=exchangeSummaryV111(s.id);
  const expenses=Number($('#cashExpenses')?.value||0);
  const tmp={...s,cash_expenses:expenses};
  const expectedCash=expectedCashNioV83(tmp);
  const expectedUsd=expectedCashUsdV111(s);
  const countedCash=Number($('#countedCash')?.value||0);
  const countedUsd=Number($('#countedCashUsd')?.value||0);
  const countedCard=Number($('#countedCard')?.value||0);
  const countedTransfer=Number($('#countedTransfer')?.value||0);
  const expectedCard=summary.card;
  const expectedTransfer=summary.transfer;
  const diffCash=countedCash-expectedCash;
  const diffUsd=countedUsd-expectedUsd;
  const diffCard=countedCard-expectedCard;
  const diffTransfer=countedTransfer-expectedTransfer;
  const diffTotal=diffCash+diffCard+diffTransfer;
  box.innerHTML=`<div class="closing-summary-title">Cuadre automático con Mesa de Cambio</div>
    <div class="closing-summary-grid">
      <div><span>Ventas efectivo C$</span><strong>${money(summary.cashNio+summary.mixed-summary.changeNio)}</strong></div>
      <div><span>Mesa Cambio C$</span><strong>${money(ex.nioIn-ex.nioOut)}</strong></div>
      <div><span>Efectivo esperado C$</span><strong>${money(expectedCash)}</strong></div>
      <div><span>Efectivo contado C$</span><strong>${money(countedCash)}</strong></div>
      <div class="${diffClassV6(diffCash)}"><span>Diferencia C$</span><strong>${diffLabelV6(diffCash)}</strong></div>
      <div><span>Mesa Cambio US$</span><strong>US$ ${(ex.usdIn-ex.usdOut).toFixed(2)}</strong></div>
      <div><span>Efectivo esperado US$</span><strong>US$ ${expectedUsd.toFixed(2)}</strong></div>
      <div><span>Efectivo contado US$</span><strong>US$ ${countedUsd.toFixed(2)}</strong></div>
      <div class="${diffClassV6(diffUsd)}"><span>Diferencia US$</span><strong>US$ ${diffUsd.toFixed(2)}</strong></div>
      <div><span>Tarjeta esperado</span><strong>${money(expectedCard)}</strong></div>
      <div><span>Transferencia esperado</span><strong>${money(expectedTransfer)}</strong></div>
      <div class="${diffClassV6(diffTotal)}"><span>Diferencia total C$</span><strong>${diffLabelV6(diffTotal)}</strong></div>
    </div>`;
};
closeCash=async function(){
  const id=$('#closeCashSession').value; if(!id) return showToastV1043('No hay caja abierta para cerrar.','warning');
  const session = cashSessions.find(s=>String(s.id)===String(id)) || {};
  const summary=cashSessionSalesV83(id);
  const countedCash=Number($('#countedCash')?.value||0);
  const countedCashUsd=Number($('#countedCashUsd')?.value||0);
  const countedCard=Number($('#countedCard')?.value||0);
  const countedTransfer=Number($('#countedTransfer')?.value||0);
  const expenses=Number($('#cashExpenses')?.value||0);
  const tempSession={...session,cash_expenses:expenses};
  const expectedCash=expectedCashNioV83(tempSession);
  const expectedCashUsd=expectedCashUsdV111(session);
  const expectedCard=summary.card;
  const expectedTransfer=summary.transfer;
  const diffCash=countedCash-expectedCash;
  const diffUsd=countedCashUsd-expectedCashUsd;
  const diffCard=countedCard-expectedCard;
  const diffTransfer=countedTransfer-expectedTransfer;
  const countedTotal=countedCash+countedCard+countedTransfer;
  const expectedTotal=expectedCash+expectedCard+expectedTransfer;
  const diffTotal=diffCash+diffCard+diffTransfer;
  if((diffTotal!==0 || diffUsd!==0) && !($('#closingNote')?.value||'').trim()) return showToastV1043('Hay diferencia. Debes registrar una observación antes de cerrar caja.','warning');
  const payload={status:'CLOSED',closed_at:new Date().toISOString(),expected_cash:expectedCash,expected_total:expectedTotal,counted_cash:countedCash,counted_card:countedCard,counted_transfer:countedTransfer,cash_expenses:expenses,counted_total:countedTotal,difference_amount:diffTotal,opening_cash_nio:Number(session.opening_cash_nio||session.opening_amount||0),opening_cash_usd:Number(session.opening_cash_usd||0),expected_cash_nio:expectedCash,expected_cash_usd:expectedCashUsd,counted_cash_nio:countedCash,counted_cash_usd:countedCashUsd,difference_cash_nio:diffCash,difference_cash_usd:diffUsd,closing_note:$('#closingNote')?.value||null};
  const r=await sb.from('cash_sessions').update(payload).eq('id',id);
  if(r.error) return showToastV1043(r.error.message,'error');
  showToastV1043('Caja cerrada con Mesa de Cambio incluida en el arqueo.','success');
  await loadAll();
};
if($('#closeCashBtn')) $('#closeCashBtn').onclick=closeCash;

const renderDashboardV111Base=renderDashboard;
renderDashboard=function(){
  renderDashboardV111Base();
  const today=todayISO();
  const opsToday=(exchangeOperationsV111||[]).filter(o=>(o.created_at||'').slice(0,10)===today);
  let block=$('#exchangeDashWidget');
  if(!block && $('#dashboard .kpis')){
    block=document.createElement('article'); block.id='exchangeDashWidget'; $('#dashboard .kpis').appendChild(block);
  }
  if(block){
    const volume=opsToday.reduce((a,o)=>a+Number(o.amount_nio||0),0);
    const profit=opsToday.reduce((a,o)=>a+Number(o.profit_nio||0),0);
    block.innerHTML=`<small>Mesa cambio hoy</small><b>${money(volume)}</b><span>Utilidad estimada ${money(profit)}</span>`;
  }
};
(function bootV111(){
  const nav=document.querySelector('nav');
  if(nav && !nav.querySelector('[data-view="exchange"]')){
    const b=document.createElement('button'); b.dataset.view='exchange'; b.textContent='Mesa de Cambio'; nav.insertBefore(b, nav.querySelector('[data-view="users"]'));
  }
  const title=document.querySelector('title'); if(title) title.textContent='MM Comercial ERP V11.1 Mesa de Cambio';
  document.querySelector('.brand span') && (document.querySelector('.brand span').textContent='V11.1 Mesa Cambio');
  const pill=document.querySelector('.version-pill'); if(pill) pill.textContent='V11.1';
  bindExchangeV111();
  document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view,b));
  setTimeout(()=>{bindExchangeV111(); fillExchangeSessionSelectV111(); renderExchangeV111(); updateClosingCashSummaryV84();},800);
})();

/* ==========================================================
   V11.2 MESA DE CAMBIO HUMANA + DASHBOARD EJECUTIVO
   - Cajero no edita tasas.
   - Tasas públicas MM: compra 36.20 / venta 37.25 por defecto.
   - Documentos con formato: cédula, pasaporte y residencia.
   - Dashboard con metas, comparativos y proyección.
   ========================================================== */
let exchangeSettingsV112 = {
  provider_name:'BAC',
  provider_buy_rate:Number(localStorage.getItem('mm_bac_buy_rate') || 36.30),
  provider_sell_rate:Number(localStorage.getItem('mm_bac_sell_rate') || 37.14),
  mm_buy_rate:Number(localStorage.getItem('mm_buy_rate') || 36.20),
  mm_sell_rate:Number(localStorage.getItem('mm_sell_rate') || 37.25),
  effective_date:todayISO()
};
function activeExchangeSettingsV112(){ return exchangeSettingsV112; }
function rateForExchangeTypeV112(type){ const s=activeExchangeSettingsV112(); return String(type).toUpperCase()==='BUY_USD' ? Number(s.mm_buy_rate) : Number(s.mm_sell_rate); }
function refRateForExchangeTypeV112(type){ const s=activeExchangeSettingsV112(); return String(type).toUpperCase()==='BUY_USD' ? Number(s.provider_buy_rate) : Number(s.provider_sell_rate); }
function exchangeTypeHumanV112(type){ return String(type).toUpperCase()==='BUY_USD' ? 'Cliente vende dólares' : 'Cliente compra dólares'; }
function exchangeCashImpactV112(type, usd, nio){ return String(type).toUpperCase()==='BUY_USD'
  ? {client:`El cliente entrega US$ ${usd.toFixed(2)} y recibe ${money(nio)}.`, cash:`Caja: entran US$ ${usd.toFixed(2)} y salen ${money(nio)}.`}
  : {client:`El cliente recibe US$ ${usd.toFixed(2)} y paga ${money(nio)}.`, cash:`Caja: entran ${money(nio)} y salen US$ ${usd.toFixed(2)}.`}; }
function updateExchangeRateStripV112(){
  const s=activeExchangeSettingsV112();
  const set=(id,v)=>{const el=$('#'+id); if(el) el.textContent=Number(v).toFixed(2);};
  set('exchangeBacBuyView',s.provider_buy_rate); set('exchangeBacSellView',s.provider_sell_rate);
  set('exchangeMmBuyView',s.mm_buy_rate); set('exchangeMmSellView',s.mm_sell_rate);
}
function syncExchangeRatesToFormV112(){
  const type=$('#exchangeType')?.value || 'SELL_USD';
  const rate=rateForExchangeTypeV112(type);
  const ref=refRateForExchangeTypeV112(type);
  if($('#exchangeRate')) $('#exchangeRate').value=rate.toFixed(2);
  if($('#exchangeReferenceRate')) $('#exchangeReferenceRate').value=ref.toFixed(2);
  const label=$('#exchangeUsdLabel');
  if(label) label.childNodes[0].textContent = type==='BUY_USD' ? 'Dólares que entrega el cliente ' : 'Dólares que desea el cliente ';
  updateExchangeRateStripV112();
}
function formatPhoneV112(v){ const d=String(v||'').replace(/\D/g,'').slice(0,8); return d.length>4?d.slice(0,4)+'-'+d.slice(4):d; }
function formatCedulaV112(v){
  let raw=String(v||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
  const letter=(raw.match(/[A-Z]$/)||[''])[0];
  const digits=raw.replace(/\D/g,'').slice(0,13);
  let out=digits;
  if(digits.length>3) out=digits.slice(0,3)+'-'+digits.slice(3);
  if(digits.length>9) out=digits.slice(0,3)+'-'+digits.slice(3,9)+'-'+digits.slice(9);
  if(letter && digits.length>=13) out+=letter;
  return out;
}
function formatPassportV112(v){ return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,9); }
function formatResidenciaV112(v){
  const d=String(v||'').toUpperCase().replace(/RES/g,'').replace(/\D/g,'').slice(0,10);
  if(!d) return '';
  if(d.length<=6) return 'RES-'+d;
  return 'RES-'+d.slice(0,6)+'-'+d.slice(6);
}
function formatDocumentV112(){
  const t=$('#exchangeDocumentType')?.value || 'CEDULA';
  const el=$('#exchangeDocumentNumber'); if(!el) return;
  if(t==='CEDULA') el.value=formatCedulaV112(el.value);
  if(t==='PASAPORTE') el.value=formatPassportV112(el.value);
  if(t==='RESIDENCIA') el.value=formatResidenciaV112(el.value);
}
function documentPlaceholderV112(){
  const t=$('#exchangeDocumentType')?.value || 'CEDULA';
  const el=$('#exchangeDocumentNumber'); if(!el) return;
  if(t==='CEDULA') el.placeholder='000-000000-0000A';
  if(t==='PASAPORTE') el.placeholder='A00000000';
  if(t==='RESIDENCIA') el.placeholder='RES-000000-0000';
  formatDocumentV112();
}
function validateExchangeCustomerV112(){
  const type=$('#exchangeDocumentType')?.value || 'CEDULA';
  const doc=String($('#exchangeDocumentNumber')?.value||'').trim().toUpperCase();
  const name=String($('#exchangeCustomerName')?.value||'').trim().replace(/\s+/g,' ');
  const phone=String($('#exchangeCustomerPhone')?.value||'').trim();
  if(!name) return {ok:false,msg:'Ingresa el nombre completo del cliente.'};
  if(/\d/.test(name)) return {ok:false,msg:'El nombre completo no debe llevar números. Esa creatividad se queda para los códigos internos.'};
  const rules={
    CEDULA:/^\d{3}-\d{6}-\d{4}[A-Z]$/,
    PASAPORTE:/^[A-Z][0-9]{8}$/,
    RESIDENCIA:/^RES-\d{6}-\d{4}$/
  };
  if(!rules[type].test(doc)){
    const example=type==='CEDULA'?'001-010190-0001A':type==='PASAPORTE'?'A12345678':'RES-123456-0001';
    return {ok:false,msg:`Formato inválido. Ejemplo ${type}: ${example}`};
  }
  if(phone && !/^\d{4}-\d{4}$/.test(phone)) return {ok:false,msg:'El celular debe tener formato 0000-0000.'};
  return {ok:true, doc_type:type, doc, name, phone};
}
exchangePreviewV111 = function(){
  syncExchangeRatesToFormV112();
  const type=$('#exchangeType')?.value || 'SELL_USD';
  const usd=Number($('#exchangeUsdAmount')?.value||0);
  const rate=rateForExchangeTypeV112(type);
  const ref=refRateForExchangeTypeV112(type);
  const nio=Number((usd*rate).toFixed(2));
  const profit=type==='SELL_USD'?Number((usd*(rate-ref)).toFixed(2)):Number((usd*(ref-rate)).toFixed(2));
  if($('#exchangeNioAmount')) $('#exchangeNioAmount').value = nio?Math.ceil(nio):'';
  const box=$('#exchangePreviewBox'); if(!box) return;
  if(!usd){ box.innerHTML='Ingresa los dólares y el sistema calcula todo. El cajero no toca tasas, por el bien de todos.'; return; }
  const impact=exchangeCashImpactV112(type,usd,nio);
  box.innerHTML=`<div class="exchange-preview-v112"><b>${exchangeTypeHumanV112(type)}</b><span>${impact.client}</span><span>${impact.cash}</span><small>Tasa MM: ${rate.toFixed(2)} · Referencia ${activeExchangeSettingsV112().provider_name}: ${ref.toFixed(2)} · Margen estimado: ${money(profit)}</small></div>`;
};
const renderExchangeV111BaseV112 = renderExchangeV111;
renderExchangeV111 = function(){ renderExchangeV111BaseV112(); syncExchangeRatesToFormV112(); updateExchangeRateStripV112(); documentPlaceholderV112(); };
submitExchangeV111 = async function(e){
  e.preventDefault();
  syncExchangeRatesToFormV112();
  const sessionId=$('#exchangeCashSession')?.value || $('#activeCashBox')?.value;
  if(!sessionId) return showToastV1043('Debes abrir o seleccionar una caja antes de operar Mesa de Cambio.','warning');
  const type=$('#exchangeType')?.value || 'SELL_USD';
  const usd=Number($('#exchangeUsdAmount')?.value||0);
  const rate=rateForExchangeTypeV112(type);
  const ref=refRateForExchangeTypeV112(type);
  if(usd<=0) return showToastV1043('Ingresa el monto en dólares. La intuición no cuadra caja.','warning');
  const valid=validateExchangeCustomerV112();
  if(!valid.ok) return showToastV1043(valid.msg,'warning');
  const session=(cashSessions||[]).find(s=>String(s.id)===String(sessionId));
  if(!session || String(session.status).toUpperCase()!=='OPEN') return showToastV1043('La caja seleccionada no está abierta.','error');
  const nio=Number((usd*rate).toFixed(2));
  const profit=type==='SELL_USD'?Number((usd*(rate-ref)).toFixed(2)):Number((usd*(ref-rate)).toFixed(2));
  try{
    await sb.from('exchange_customers').upsert({document_type:valid.doc_type, document_number:valid.doc, full_name:valid.name, phone:valid.phone||null, updated_at:new Date().toISOString()},{onConflict:'document_type,document_number'});
  }catch(err){ console.warn('exchange_customers no disponible o sin permisos',err); }
  const payload={
    cash_session_id:sessionId,
    operation_type:type,
    currency_from:type==='SELL_USD'?'NIO':'USD',
    currency_to:type==='SELL_USD'?'USD':'NIO',
    amount_usd:usd,
    rate:rate,
    amount_nio:nio,
    reference_rate:ref,
    profit_nio:profit,
    customer_name:valid.name,
    customer_document_type:valid.doc_type,
    customer_document_number:valid.doc,
    customer_phone:valid.phone||null,
    reference:`${valid.doc_type}: ${valid.doc}`,
    notes:$('#exchangeNotes')?.value||null,
    provider_name:activeExchangeSettingsV112().provider_name,
    provider_buy_rate:activeExchangeSettingsV112().provider_buy_rate,
    provider_sell_rate:activeExchangeSettingsV112().provider_sell_rate,
    status:'COMPLETED',
    created_at:new Date().toISOString()
  };
  const r=await sb.from('exchange_operations').insert(payload).select().single();
  if(r.error) return showToastV1043('No se pudo registrar Mesa de Cambio: '+r.error.message,'error');
  showToastV1043('Operación registrada. Ya impacta el arqueo C$ y US$.','success');
  $('#exchangeForm')?.reset();
  syncExchangeRatesToFormV112();
  exchangeOperationsV111.unshift(r.data||payload);
  renderExchangeV111(); updateClosingCashSummaryV84(); renderCash(); renderDashboard();
};
bindExchangeV111 = function(){
  if($('#exchangeForm')) $('#exchangeForm').onsubmit=submitExchangeV111;
  ['exchangeType','exchangeUsdAmount','exchangeCashSession'].forEach(id=>{const el=$('#'+id); if(el){el.oninput=exchangePreviewV111; el.onchange=()=>{exchangePreviewV111(); renderExchangeV111();};}});
  const docType=$('#exchangeDocumentType'); if(docType) docType.onchange=documentPlaceholderV112;
  const doc=$('#exchangeDocumentNumber'); if(doc) doc.oninput=formatDocumentV112;
  const phone=$('#exchangeCustomerPhone'); if(phone) phone.oninput=()=>{phone.value=formatPhoneV112(phone.value);};
};
const loadAllV112Base = loadAll;
loadAll = async function(){
  await loadAllV112Base();
  try{
    const r=await sb.from('exchange_rate_settings').select('*').eq('status','ACTIVE').order('effective_date',{ascending:false}).limit(1).maybeSingle();
    if(!r.error && r.data){ exchangeSettingsV112={...exchangeSettingsV112,...r.data}; }
  }catch(e){ console.warn('exchange_rate_settings no disponible; usando tasas locales por defecto.',e); }
  syncExchangeRatesToFormV112(); renderDashboardV112();
};
function dateOnlyV112(v){ return String(v||'').slice(0,10); }
function startOfWeekV112(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function addDaysV112(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function sumSalesBetweenV112(start,end){ const s=start.toISOString().slice(0,10), e=end.toISOString().slice(0,10); return (sales||[]).filter(x=>dateOnlyV112(x.created_at)>=s && dateOnlyV112(x.created_at)<e).reduce((a,x)=>a+Number(x.total||0),0); }
function pctV112(a,b){ return b>0?((a-b)/b)*100:0; }
function goalV112(k,def){ return Number(localStorage.getItem('mm_goal_'+k)||def); }
function progressV112(value,goal){ const p=goal>0?Math.min(100,(value/goal)*100):0; return `<div class="goalbar-v112"><i style="width:${p.toFixed(1)}%"></i></div><small>${p.toFixed(1)}% de ${money(goal)}</small>`; }
function renderDashboardV112(){
  const el=$('#businessDashboardV112'); if(!el) return;
  const now=new Date(); const today=new Date(now); today.setHours(0,0,0,0);
  const tomorrow=addDaysV112(today,1), yesterday=addDaysV112(today,-1);
  const week=startOfWeekV112(today), prevWeek=addDaysV112(week,-7);
  const month=new Date(today.getFullYear(),today.getMonth(),1), prevMonth=new Date(today.getFullYear(),today.getMonth()-1,1), nextMonth=new Date(today.getFullYear(),today.getMonth()+1,1);
  const year=new Date(today.getFullYear(),0,1), prevYear=new Date(today.getFullYear()-1,0,1), nextYear=new Date(today.getFullYear()+1,0,1);
  const todaySales=sumSalesBetweenV112(today,tomorrow), yesterdaySales=sumSalesBetweenV112(yesterday,today);
  const weekSales=sumSalesBetweenV112(week,addDaysV112(week,7)), prevWeekSales=sumSalesBetweenV112(prevWeek,week);
  const monthSales=sumSalesBetweenV112(month,nextMonth), prevMonthSales=sumSalesBetweenV112(prevMonth,month);
  const yearSales=sumSalesBetweenV112(year,nextYear), prevYearSales=sumSalesBetweenV112(prevYear,year);
  const hoursPassed=Math.max(1, now.getHours()+now.getMinutes()/60); const projectedDay=todaySales/hoursPassed*12;
  const dailyGoal=goalV112('daily',25000), weeklyGoal=goalV112('weekly',150000), monthlyGoal=goalV112('monthly',700000), yearlyGoal=goalV112('yearly',8500000);
  const exchangeToday=(exchangeOperationsV111||[]).filter(x=>dateOnlyV112(x.created_at)===todayISO());
  const exchangeProfit=exchangeToday.reduce((a,x)=>a+Number(x.profit_nio||0),0);
  const lowStock=(products||[]).filter(p=>Number(p.stock||0)<=Number(p.min_stock||0)).length;
  const noLabel=(products||[]).filter(p=>!(p.barcode||p.internal_code)).length;
  const sign=v=>v>=0?'▲':'▼'; const cls=v=>v>=0?'positive':'negative';
  el.innerHTML=`
    <div class="dashboard-goals-v112 panel">
      <div><h3>Centro de Inteligencia Comercial</h3><p>Ventas, metas y ritmo del negocio. Por fin el dashboard hace algo más que verse ocupado.</p></div>
      <div class="goal-card-v112"><b>Meta diaria</b><strong>${money(todaySales)}</strong>${progressV112(todaySales,dailyGoal)}<span>Proyección: ${money(projectedDay)}</span></div>
      <div class="goal-card-v112"><b>Meta semanal</b><strong>${money(weekSales)}</strong>${progressV112(weekSales,weeklyGoal)}</div>
      <div class="goal-card-v112"><b>Meta mensual</b><strong>${money(monthSales)}</strong>${progressV112(monthSales,monthlyGoal)}</div>
      <div class="goal-card-v112"><b>Meta anual</b><strong>${money(yearSales)}</strong>${progressV112(yearSales,yearlyGoal)}</div>
    </div>
    <div class="comparison-grid-v112">
      <article><small>Hoy vs ayer</small><b>${money(todaySales)} / ${money(yesterdaySales)}</b><span class="${cls(pctV112(todaySales,yesterdaySales))}">${sign(pctV112(todaySales,yesterdaySales))} ${Math.abs(pctV112(todaySales,yesterdaySales)).toFixed(1)}%</span></article>
      <article><small>Semana vs anterior</small><b>${money(weekSales)} / ${money(prevWeekSales)}</b><span class="${cls(pctV112(weekSales,prevWeekSales))}">${sign(pctV112(weekSales,prevWeekSales))} ${Math.abs(pctV112(weekSales,prevWeekSales)).toFixed(1)}%</span></article>
      <article><small>Mes vs anterior</small><b>${money(monthSales)} / ${money(prevMonthSales)}</b><span class="${cls(pctV112(monthSales,prevMonthSales))}">${sign(pctV112(monthSales,prevMonthSales))} ${Math.abs(pctV112(monthSales,prevMonthSales)).toFixed(1)}%</span></article>
      <article><small>Año vs anterior</small><b>${money(yearSales)} / ${money(prevYearSales)}</b><span class="${cls(pctV112(yearSales,prevYearSales))}">${sign(pctV112(yearSales,prevYearSales))} ${Math.abs(pctV112(yearSales,prevYearSales)).toFixed(1)}%</span></article>
      <article><small>Mesa de Cambio hoy</small><b>${money(exchangeProfit)}</b><span>Utilidad diferencial</span></article>
      <article><small>Alertas operativas</small><b>${lowStock} stock bajo · ${noLabel} sin etiqueta</b><span>Trabajo pendiente</span></article>
    </div>`;
}
const renderDashboardV112Base = renderDashboard;
renderDashboard = function(){ renderDashboardV112Base(); renderDashboardV112(); };
setTimeout(()=>{bindExchangeV111(); syncExchangeRatesToFormV112(); renderDashboardV112();},800);


/* =====================================================
   V11.4 Release Candidate - Autenticación empresarial
   Login real contra app_users, contraseñas SHA-256, cambio
   obligatorio en primer ingreso, bloqueo por intentos y auditoría.
===================================================== */
let currentUserV114 = null;
let pendingPasswordUserV114 = null;
const MAX_LOGIN_ATTEMPTS_V114 = 5;

async function sha256V114(text){
  const data = new TextEncoder().encode(String(text||''));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function normalizeUserV114(v){ return String(v||'').trim().toLowerCase(); }
function nowIsoV114(){ return new Date().toISOString(); }
function setLoginMessageV114(msg, ok=false){
  const el=$('#loginMessage');
  if(el){ el.textContent=msg||''; el.style.color=ok?'#86efac':'#fca5a5'; }
}
function setPasswordChangeMessageV114(msg, ok=false){
  const el=$('#passwordChangeMessage');
  if(el){ el.textContent=msg||''; el.style.color=ok?'#86efac':'#fca5a5'; }
}
function isLockedUserV114(user){
  if(String(user?.status||'').toUpperCase()==='BLOCKED') return true;
  if(!user?.locked_until) return false;
  return new Date(user.locked_until).getTime() > Date.now();
}
function needsPasswordChangeV114(user){
  return user?.must_change_password === true || String(user?.password_hash||'') === '123456';
}
async function auditLoginV114(user, action, status, notes=''){
  try{
    await sb.from('app_audit_log').insert({
      user_id:user?.id||null,
      username:user?.username||$('#loginUsername')?.value||null,
      action,
      module:'AUTH',
      status,
      notes,
      created_at:nowIsoV114()
    });
  }catch(_e){ /* auditoría opcional si la tabla aún no existe o RLS molesta */ }
}
async function findUserV114(username){
  username=normalizeUserV114(username);
  const r=await sb.from('app_users').select('*').eq('username', username).maybeSingle();
  if(r.error){
    console.error('Error consultando app_users:', r.error);
    throw r.error;
  }
  return r.data || null;
}
async function registerFailedLoginV114(user){
  if(!user?.id) return;
  const attempts=Number(user.failed_login_attempts||0)+1;
  const payload={failed_login_attempts:attempts, updated_at:nowIsoV114()};
  if(attempts>=MAX_LOGIN_ATTEMPTS_V114){
    payload.status='BLOCKED';
    payload.locked_until=new Date(Date.now()+30*60*1000).toISOString();
  }
  try{ await sb.from('app_users').update(payload).eq('id',user.id); }catch(_e){}
}
async function clearFailedLoginV114(user){
  if(!user?.id) return;
  try{
    await sb.from('app_users').update({
      failed_login_attempts:0,
      locked_until:null,
      last_login_at:nowIsoV114(),
      updated_at:nowIsoV114()
    }).eq('id',user.id);
  }catch(_e){}
}
function showPasswordChangeV114(user){
  pendingPasswordUserV114=user;
  const modal=$('#passwordChangeModal');
  if(modal) modal.classList.remove('hidden');
  setPasswordChangeMessageV114('');
  setLoginMessageV114('Debe cambiar su contraseña para continuar.', true);
  setTimeout(()=>$('#newPassword')?.focus(),80);
}
function hidePasswordChangeV114(){
  pendingPasswordUserV114=null;
  const modal=$('#passwordChangeModal');
  if(modal) modal.classList.add('hidden');
  if($('#passwordChangeForm')) $('#passwordChangeForm').reset();
  setPasswordChangeMessageV114('');
}
function applySessionV114(user){
  currentUserV114=user;
  currentRole=user?.role || 'CAJERO';
  localStorage.setItem('mm_session_user', JSON.stringify({
    id:user.id||null,
    username:user.username,
    name:user.name,
    role:user.role,
    login_at:nowIsoV114()
  }));
  localStorage.setItem('mm_role', currentRole);
  localStorage.setItem('mm_user_id', user.id||'');
  localStorage.setItem('mm_user_name', user.name||user.username||'');
  document.body.classList.remove('auth-locked');
  document.body.classList.remove('role-ADMIN','role-SUPERVISOR','role-CAJERO','role-BODEGA','role-CONSULTA');
  document.body.classList.add('role-'+currentRole);
  if($('#roleSelect')){ $('#roleSelect').value=currentRole; $('#roleSelect').disabled=true; }
  if($('#currentUserBadge')) $('#currentUserBadge').textContent=`${user.name || user.username} · ${currentRole}`;
  applyRole();
}
function lockSessionV114(){
  document.body.classList.add('auth-locked');
  document.body.classList.remove('role-ADMIN','role-SUPERVISOR','role-CAJERO','role-BODEGA','role-CONSULTA');
  if($('#currentUserBadge')) $('#currentUserBadge').textContent='Sin sesión';
}
function restoreSessionV114(){
  try{
    const raw=localStorage.getItem('mm_session_user');
    if(!raw) return false;
    const u=JSON.parse(raw);
    if(!u?.username || !u?.role) return false;
    applySessionV114(u);
    return true;
  }catch(e){ return false; }
}
async function loginV114(e){
  e.preventDefault();
  setLoginMessageV114('Validando credenciales...');
  const username=normalizeUserV114($('#loginUsername')?.value);
  const pass=$('#loginPassword')?.value||'';
  if(!username || !pass){ setLoginMessageV114('Ingrese usuario y contraseña.'); return; }
  let user=null;
  try{ user=await findUserV114(username); }
  catch(err){ setLoginMessageV114('No se pudo validar el usuario. Revise conexión o permisos de Supabase.'); return; }
  if(!user){ setLoginMessageV114('Usuario o contraseña incorrecta.'); return; }
  if(isLockedUserV114(user)){
    await auditLoginV114(user,'LOGIN','BLOCKED','Intento con usuario bloqueado');
    setLoginMessageV114('Usuario bloqueado. Contacte al administrador.');
    return;
  }
  if(String(user.status||'').toUpperCase()!=='ACTIVE'){
    setLoginMessageV114('Usuario no activo. Contacte al administrador.');
    return;
  }
  const hash=await sha256V114(pass);
  const validPassword = String(user.password_hash||'') === hash || String(user.password_hash||'') === pass;
  if(!validPassword){
    await registerFailedLoginV114(user);
    await auditLoginV114(user,'LOGIN','FAILED','Contraseña incorrecta');
    setLoginMessageV114('Usuario o contraseña incorrecta.');
    return;
  }
  if(needsPasswordChangeV114(user)){
    showPasswordChangeV114(user);
    return;
  }
  await clearFailedLoginV114(user);
  await auditLoginV114(user,'LOGIN','SUCCESS','Acceso correcto');
  setLoginMessageV114('Acceso correcto.', true);
  applySessionV114(user);
  if($('#loginPassword')) $('#loginPassword').value='';
}
async function changeInitialPasswordV114(e){
  e.preventDefault();
  if(!pendingPasswordUserV114){ setPasswordChangeMessageV114('Sesión temporal no encontrada. Vuelva a ingresar.'); return; }
  const p1=$('#newPassword')?.value||'';
  const p2=$('#confirmPassword')?.value||'';
  if(p1.length<8){ setPasswordChangeMessageV114('La contraseña debe tener al menos 8 caracteres.'); return; }
  if(p1!==p2){ setPasswordChangeMessageV114('Las contraseñas no coinciden.'); return; }
  if(p1==='123456'){ setPasswordChangeMessageV114('Use una contraseña diferente a la temporal.'); return; }
  const hash=await sha256V114(p1);
  const updated={...pendingPasswordUserV114, password_hash:hash, must_change_password:false, last_login_at:nowIsoV114(), failed_login_attempts:0, locked_until:null};
  try{
    const r=await sb.from('app_users').update({
      password_hash:hash,
      must_change_password:false,
      failed_login_attempts:0,
      locked_until:null,
      last_login_at:nowIsoV114(),
      updated_at:nowIsoV114()
    }).eq('id',pendingPasswordUserV114.id);
    if(r.error) throw r.error;
  }catch(err){
    console.error(err);
    setPasswordChangeMessageV114('No se pudo guardar la contraseña. Revise permisos/RLS.');
    return;
  }
  await auditLoginV114(updated,'PASSWORD_CHANGE','SUCCESS','Cambio obligatorio completado');
  hidePasswordChangeV114();
  if($('#loginPassword')) $('#loginPassword').value='';
  setLoginMessageV114('Contraseña actualizada. Acceso correcto.', true);
  applySessionV114(updated);
}
function logoutV114(){
  const raw=localStorage.getItem('mm_session_user');
  try{ const u=raw?JSON.parse(raw):null; auditLoginV114(u,'LOGOUT','SUCCESS','Cierre de sesión'); }catch(_e){}
  localStorage.removeItem('mm_session_user');
  localStorage.removeItem('mm_role');
  localStorage.removeItem('mm_user_id');
  localStorage.removeItem('mm_user_name');
  currentUserV114=null;
  lockSessionV114();
}
function bindLoginPortalV114(){
  if($('#loginForm')) $('#loginForm').onsubmit=loginV114;
  if($('#passwordChangeForm')) $('#passwordChangeForm').onsubmit=changeInitialPasswordV114;
  if($('#logoutBtn')) $('#logoutBtn').onclick=logoutV114;
  if(!restoreSessionV114()) lockSessionV114();
}
const bindV114Base = bind;
bind = function(){
  bindV114Base();
  bindLoginPortalV114();
};
const renderUsersV114Base = renderUsers;
renderUsers = function(){
  const table=$('#usersTable'); if(!table) return renderUsersV114Base();
  table.innerHTML='<tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Intentos</th><th>Último ingreso</th></tr>'+users.map(u=>`<tr><td><b>${u.username||''}</b><br><small>${u.email||''}</small></td><td>${u.name||''}</td><td><span class="tag">${u.role}</span></td><td>${u.status}</td><td>${u.failed_login_attempts||0}</td><td>${u.last_login_at?new Date(u.last_login_at).toLocaleString():'-'}</td></tr>`).join('');
};
const saveUserV114Base = saveUser;
saveUser = async function(e){
  e.preventDefault(); if(!guardAdmin())return;
  const username=normalizeUserV114($('#userEmail')?.value || $('#userName')?.value?.replace(/\s+/g,'.'));
  const tempHash=await sha256V114('123456');
  const r=await sb.from('app_users').insert({
    name:$('#userName').value,
    email:$('#userEmail').value||null,
    phone:$('#userPhone').value||null,
    username,
    password_hash:tempHash,
    must_change_password:true,
    failed_login_attempts:0,
    status:$('#userStatus').value,
    role:$('#userRole').value
  });
  if(r.error) return showToastV1043 ? showToastV1043(r.error.message,'error') : alert(r.error.message);
  $('#userForm').reset(); await loadAll();
};
setTimeout(bindLoginPortalV114, 250);
