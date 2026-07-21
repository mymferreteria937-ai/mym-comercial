const cfg = window.MM_CONFIG || {};
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY === 'TU_ANON_KEY') alert('Falta configurar la conexión con Supabase en app/config.js.');
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
  /* sales.total ya representa el importe neto cobrado. Restar change_amount
     nuevamente descontaba el cambio dos veces y reducía el efectivo esperado. */
  return opening + summary.cashNio + summary.mixed - expenses;
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
      p.internal_code,p.barcode,p.supplier_code,p.supplier_name,p.manufacturer_code,p.name,p.clean_name,
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
      <div><span>Ventas efectivo C$</span><strong>${money(summary.cashNio+summary.mixed)}</strong></div>
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
let passwordChangeModeV114 = 'initial';
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
function configurePasswordModalV114(mode='initial'){
  passwordChangeModeV114=mode;
  const isInitial=mode==='initial';
  const title=$('#passwordChangeTitle');
  const help=$('#passwordChangeHelp');
  const current=$('#currentPassword');
  const submit=$('#passwordChangeSubmit');
  const cancel=$('#passwordChangeCancel');
  if(title) title.textContent=isInitial?'Cambio de contraseña requerido':'Cambiar mi contraseña';
  if(help) help.textContent=isInitial
    ? 'Por seguridad, debe crear una nueva contraseña antes de ingresar al sistema.'
    : 'Ingrese su contraseña actual y defina una nueva contraseña.';
  if(current){
    current.value='';
    current.required=!isInitial;
    current.style.display=isInitial?'none':'';
    const label=current.previousElementSibling;
    if(label) label.style.display=isInitial?'none':'';
  }
  if(submit) submit.textContent=isInitial?'Guardar contraseña e ingresar':'Actualizar contraseña';
  if(cancel) cancel.classList.toggle('hidden', isInitial);
}
function showPasswordChangeV114(user){
  pendingPasswordUserV114=user;
  configurePasswordModalV114('initial');
  const modal=$('#passwordChangeModal');
  if(modal) modal.classList.remove('hidden');
  setPasswordChangeMessageV114('');
  setLoginMessageV114('Debe cambiar su contraseña para continuar.', true);
  setTimeout(()=>$('#newPassword')?.focus(),80);
}
function openVoluntaryPasswordChangeV114(){
  const raw=localStorage.getItem('mm_session_user');
  let sessionUser=null;
  try{ sessionUser=raw?JSON.parse(raw):null; }catch(_e){}
  if(!sessionUser?.username){ alert('Debe iniciar sesión para cambiar su contraseña.'); return; }
  pendingPasswordUserV114=sessionUser;
  configurePasswordModalV114('voluntary');
  const modal=$('#passwordChangeModal');
  if(modal) modal.classList.remove('hidden');
  if($('#passwordChangeForm')) $('#passwordChangeForm').reset();
  setPasswordChangeMessageV114('');
  setTimeout(()=>$('#currentPassword')?.focus(),80);
}
function hidePasswordChangeV114(){
  pendingPasswordUserV114=null;
  passwordChangeModeV114='initial';
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
    user.__login_hash = hash;
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

  const isVoluntary=passwordChangeModeV114==='voluntary';
  let user=pendingPasswordUserV114;

  // En cambio voluntario se vuelve a leer el usuario desde Supabase y se valida la contraseña actual.
  if(isVoluntary){
    try{ user=await findUserV114(user.username); }
    catch(_err){ setPasswordChangeMessageV114('No se pudo validar el usuario actual.'); return; }
    if(!user){ setPasswordChangeMessageV114('Usuario no encontrado.'); return; }
    const currentPass=$('#currentPassword')?.value||'';
    const currentHash=await sha256V114(currentPass);
    const validCurrent = String(user.password_hash||'') === currentHash || String(user.password_hash||'') === currentPass;
    if(!validCurrent){ setPasswordChangeMessageV114('La contraseña actual no es correcta.'); return; }
  }

  const p1=$('#newPassword')?.value||'';
  const p2=$('#confirmPassword')?.value||'';
  if(p1.length<8){ setPasswordChangeMessageV114('La contraseña debe tener al menos 8 caracteres.'); return; }
  if(p1!==p2){ setPasswordChangeMessageV114('Las contraseñas no coinciden.'); return; }
  if(p1==='123456'){ setPasswordChangeMessageV114('Use una contraseña diferente a la temporal.'); return; }

  const hash=await sha256V114(p1);
  const updated={...user, password_hash:hash, must_change_password:false, last_login_at:nowIsoV114(), failed_login_attempts:0, locked_until:null};
  try{
    const r=await sb.from('app_users').update({
      password_hash:hash,
      must_change_password:false,
      failed_login_attempts:0,
      locked_until:null,
      last_login_at:nowIsoV114(),
      updated_at:nowIsoV114()
    }).eq('id',user.id);
    if(r.error) throw r.error;
  }catch(err){
    console.error(err);
    setPasswordChangeMessageV114('No se pudo guardar la contraseña. Revise permisos/RLS.');
    return;
  }

  await auditLoginV114(updated,'PASSWORD_CHANGE','SUCCESS',isVoluntary?'Cambio voluntario completado':'Cambio obligatorio completado');
  hidePasswordChangeV114();
  if($('#loginPassword')) $('#loginPassword').value='';

  if(isVoluntary){
    alert('Contraseña actualizada correctamente.');
    applySessionV114(updated);
  }else{
    setLoginMessageV114('Contraseña actualizada. Acceso correcto.', true);
    applySessionV114(updated);
  }
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
  if($('#passwordChangeCancel')) $('#passwordChangeCancel').onclick=hidePasswordChangeV114;
  if($('#changePasswordBtn')) $('#changePasswordBtn').onclick=openVoluntaryPasswordChangeV114;
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

/* =========================================================
   V8 - Seguridad, usuarios y permisos por pantalla
   ========================================================= */
const PERMISSION_CATALOG_V8 = [
  ['dashboard','Dashboard'],
  ['pos','POS Pro'],
  ['clients','Clientes CRM'],
  ['products','Inventario'],
  ['barcode','Códigos / Etiquetas'],
  ['cash','Cajas y Cierres'],
  ['exchange','Mesa de Cambio'],
  ['users','Usuarios'],
  ['promos','Promociones'],
  ['profitability','Rentabilidad'],
  ['sales','Ventas'],
  ['settings','Configuración']
];
const ROLE_PERMISSIONS_V8 = {
  ADMIN: Object.fromEntries(PERMISSION_CATALOG_V8.map(([k])=>[k,true])),
  SUPERVISOR: {dashboard:true,pos:true,clients:true,products:true,barcode:true,cash:true,exchange:true,users:false,promos:true,profitability:true,sales:true,settings:false},
  CAJERO: {dashboard:true,pos:true,clients:true,products:false,barcode:false,cash:true,exchange:true,users:false,promos:false,profitability:false,sales:true,settings:false},
  BODEGA: {dashboard:true,pos:false,clients:false,products:true,barcode:true,cash:false,exchange:false,users:false,promos:false,profitability:false,sales:false,settings:false},
  CONSULTA: {dashboard:true,pos:false,clients:true,products:true,barcode:false,cash:false,exchange:false,users:false,promos:false,profitability:false,sales:true,settings:false}
};
let editingUserIdV8 = null;
function normalizeStatusV8(status){return String(status||'active').toLowerCase()==='inactive'?'inactive':'active'}
function getRoleTemplateV8(role){return {...(ROLE_PERMISSIONS_V8[String(role||'CAJERO').toUpperCase()]||ROLE_PERMISSIONS_V8.CAJERO)};}
function normalizePermissionsV8(user){
  const role=String(user?.role||'CAJERO').toUpperCase();
  const base=getRoleTemplateV8(role);
  const custom=(user?.permissions && typeof user.permissions==='object')?user.permissions:{};
  return {...base,...custom};
}
function currentPermissionsV8(){
  try{
    const raw=localStorage.getItem('mm_session_user');
    const u=raw?JSON.parse(raw):null;
    return normalizePermissionsV8(u||currentUserV114||{role:currentRole});
  }catch(_e){return normalizePermissionsV8({role:currentRole});}
}
function canAccessV8(view){
  if(String(currentRole||'').toUpperCase()==='ADMIN') return true;
  return currentPermissionsV8()[view]===true;
}
function applyNavigationPermissionsV8(){
  const perms=currentPermissionsV8();
  document.querySelectorAll('nav button[data-view]').forEach(btn=>{
    const view=btn.dataset.view;
    const allowed=String(currentRole||'').toUpperCase()==='ADMIN' || perms[view]===true;
    btn.classList.toggle('hidden-by-permission', !allowed);
  });
}
function firstAllowedViewV8(){
  const perms=currentPermissionsV8();
  const first=PERMISSION_CATALOG_V8.find(([k])=>String(currentRole||'').toUpperCase()==='ADMIN'||perms[k]===true);
  return first?first[0]:'dashboard';
}
const applyRoleV8Base = applyRole;
applyRole = function(){
  applyRoleV8Base();
  applyNavigationPermissionsV8();
  if(String(currentRole||'').toUpperCase()!=='ADMIN'){
    document.querySelectorAll('.adminOnly').forEach(el=>el.classList.toggle('adminLocked', !canAccessV8('settings')));
  }
};
const showViewV8Base = showView;
showView = function(id,btn){
  if(!canAccessV8(id)){
    const fallback=firstAllowedViewV8();
    alert('No tiene permisos para acceder a este módulo.');
    const fb=document.querySelector(`nav button[data-view="${fallback}"]`);
    return showViewV8Base(fallback,fb);
  }
  return showViewV8Base(id,btn);
};
const applySessionV8Base = applySessionV114;
applySessionV114 = function(user){
  const normalized={...user, permissions: normalizePermissionsV8(user)};
  currentUserV114=normalized;
  currentRole=normalized?.role || 'CAJERO';
  localStorage.setItem('mm_session_user', JSON.stringify({
    id:normalized.id||null,
    username:normalized.username,
    name:normalized.name,
    role:normalized.role,
    permissions: normalized.permissions,
    login_at:nowIsoV114()
  }));
  localStorage.setItem('mm_role', currentRole);
  localStorage.setItem('mm_user_id', normalized.id||'');
  localStorage.setItem('mm_user_name', normalized.name||normalized.username||'');
  document.body.classList.remove('auth-locked');
  document.body.classList.remove('role-ADMIN','role-SUPERVISOR','role-CAJERO','role-BODEGA','role-CONSULTA');
  document.body.classList.add('role-'+currentRole);
  if($('#roleSelect')){ $('#roleSelect').value=currentRole; $('#roleSelect').disabled=true; }
  if($('#currentUserBadge')) $('#currentUserBadge').textContent=`${normalized.name || normalized.username} · ${currentRole}`;
  applyRole();
};
function renderPermissionGridV8(perms){
  const grid=$('#permissionsGrid');
  if(!grid) return;
  const p=perms||getRoleTemplateV8($('#userRole')?.value||'CAJERO');
  grid.innerHTML=PERMISSION_CATALOG_V8.map(([key,label])=>`<label class="permission-check"><input type="checkbox" data-perm="${key}" ${p[key]?'checked':''}>${label}</label>`).join('');
}
function readPermissionGridV8(){
  const result={};
  document.querySelectorAll('#permissionsGrid input[data-perm]').forEach(chk=>{result[chk.dataset.perm]=chk.checked;});
  return result;
}

function generateAccessUserV9(){
  const rnd = Math.random().toString(36).slice(2,8);
  return `u${rnd}`;
}
function maskAccessUserV9(username){
  const u=String(username||'').trim();
  if(!u) return 'No definido';
  if(u.length<=4) return '••••';
  return `${u.slice(0,2)}••••${u.slice(-2)}`;
}
function resetUserFormV8(){
  editingUserIdV8=null;
  const f=$('#userForm'); if(f) f.reset();
  if($('#userId')) $('#userId').value='';
  if($('#userUsername')) $('#userUsername').value='';
  if($('#userRole')) $('#userRole').disabled=false;
  if($('#userFormTitle')) $('#userFormTitle').textContent='Nuevo usuario';
  if($('#userFormHelp')) $('#userFormHelp').textContent='Al crear un usuario se asigna contraseña temporal 123456 y cambio obligatorio.';
  if($('#saveUserBtn')) $('#saveUserBtn').textContent='Guardar usuario';
  if($('#cancelUserEdit')) $('#cancelUserEdit').classList.add('hidden');
  if($('#userStatus')) $('#userStatus').value='active';
  renderPermissionGridV8(getRoleTemplateV8($('#userRole')?.value||'CAJERO'));
}
function fillUserFormV8(user){
  editingUserIdV8=user.id;
  if($('#userId')) $('#userId').value=user.id||'';
  if($('#userName')) $('#userName').value=user.name||'';
  if($('#userUsername')) $('#userUsername').value=user.username||'';
  if($('#userEmail')) $('#userEmail').value=user.email||'';
  if($('#userPhone')) $('#userPhone').value=user.phone||'';
  if($('#userRole')) $('#userRole').value=String(user.role||'CAJERO').toUpperCase();
  if($('#userStatus')) $('#userStatus').value=normalizeStatusV8(user.status);
  if($('#userFormTitle')) $('#userFormTitle').textContent='Editar usuario';
  if($('#userFormHelp')) $('#userFormHelp').textContent=`Editando a ${user.username||user.name}. Los permisos se aplican al próximo ingreso.`;
  if($('#saveUserBtn')) $('#saveUserBtn').textContent='Actualizar usuario';
  if($('#cancelUserEdit')) $('#cancelUserEdit').classList.remove('hidden');
  renderPermissionGridV8(normalizePermissionsV8(user));
  setTimeout(()=>$('#userName')?.focus(),40);
}
window.editUserV8 = function(id){
  if(!guardAdmin()) return;
  const u=users.find(x=>x.id===id); if(!u) return alert('Usuario no encontrado.');
  fillUserFormV8(u);
};
window.toggleUserStatusV8 = async function(id){
  if(!guardAdmin()) return;
  const u=users.find(x=>x.id===id); if(!u) return;
  const newStatus=normalizeStatusV8(u.status)==='active'?'inactive':'active';
  const action=newStatus==='inactive'?'inactivar':'activar';
  if(!confirm(`¿Desea ${action} el usuario ${u.username||u.name}?`)) return;
  const r=await sb.from('app_users').update({status:newStatus,updated_at:nowIsoV114()}).eq('id',id);
  if(r.error) return alert(r.error.message);
  await loadAll();
};
window.resetUserPasswordV8 = async function(id){
  if(!guardAdmin()) return;
  const u=users.find(x=>x.id===id); if(!u) return;
  if(!confirm(`Se asignará la contraseña temporal 123456 a ${u.username||u.name} y deberá cambiarla al ingresar. ¿Continuar?`)) return;
  const tempHash=await sha256V114('123456');
  const r=await sb.from('app_users').update({password_hash:tempHash,must_change_password:true,failed_login_attempts:0,locked_until:null,updated_at:nowIsoV114()}).eq('id',id);
  if(r.error) return alert(r.error.message);
  alert('Contraseña temporal asignada: 123456');
  await loadAll();
};
function userMatchesFilterV8(u){
  const q=($('#userSearch')?.value||'').toLowerCase().trim();
  if(!q) return true;
  return [u.username,u.name,u.email,u.role,u.status].join(' ').toLowerCase().includes(q);
}
renderUsers = function(){
  const table=$('#usersTable'); if(!table) return;
  const rows=(users||[]).filter(userMatchesFilterV8);
  table.className='users-table';
  table.innerHTML='<tr><th>Cuenta</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Permisos</th><th>Intentos</th><th>Último ingreso</th><th>Acciones</th></tr>'+rows.map(u=>{
    const status=normalizeStatusV8(u.status);
    const perms=normalizePermissionsV8(u);
    const allowed=PERMISSION_CATALOG_V8.filter(([k])=>perms[k]).map(([,label])=>label);
    const chips=allowed.slice(0,5).map(x=>`<span class="perm-chip">${x}</span>`).join('')+(allowed.length>5?`<span class="perm-chip">+${allowed.length-5}</span>`:'');
    return `<tr><td><b>${maskAccessUserV9(u.username)}</b><br><small>Acceso protegido</small></td><td>${u.name||''}<br><small>${u.email||''}</small></td><td><span class="tag">${String(u.role||'').toUpperCase()}</span></td><td><span class="status-pill ${status}">${status==='active'?'Activo':'Inactivo'}</span></td><td><div class="perm-chips">${chips||'<span class="perm-chip">Sin permisos</span>'}</div></td><td>${u.failed_login_attempts||0}</td><td>${u.last_login_at?new Date(u.last_login_at).toLocaleString():'-'}</td><td><div class="user-actions"><button class="action-mini" onclick="editUserV8('${u.id}')">Editar</button><button class="action-mini ${status==='active'?'action-danger':'action-warn'}" onclick="toggleUserStatusV8('${u.id}')">${status==='active'?'Inactivar':'Activar'}</button><button class="action-mini" onclick="resetUserPasswordV8('${u.id}')">Reset clave</button></div></td></tr>`;
  }).join('');
};
saveUser = async function(e){
  e.preventDefault(); if(!guardAdmin()) return;
  const id=$('#userId')?.value || editingUserIdV8;
  const name=$('#userName')?.value?.trim();
  const accessUsername=normalizeUserV114($('#userUsername')?.value || generateAccessUserV9());
  const email=$('#userEmail')?.value?.trim()||null;
  const phone=$('#userPhone')?.value?.trim()||null;
  const role=String($('#userRole')?.value||'CAJERO').toUpperCase();
  const status=normalizeStatusV8($('#userStatus')?.value);
  const permissions=readPermissionGridV8();
  if(!name){ alert('Ingrese el nombre del usuario.'); return; }
  if(id){
    const r=await sb.from('app_users').update({name,username:accessUsername,email,phone,role,status,permissions,updated_at:nowIsoV114()}).eq('id',id);
    if(r.error) return alert(r.error.message);
    resetUserFormV8();
    await loadAll();
    return;
  }
  const username=accessUsername;
  const tempHash=await sha256V114('123456');
  const r=await sb.from('app_users').insert({name,email,phone,username,password_hash:tempHash,must_change_password:true,failed_login_attempts:0,locked_until:null,status,role,permissions});
  if(r.error) return alert(r.error.message);
  alert('Usuario creado. Entregue al usuario su cuenta de acceso y la contraseña temporal 123456.');
  resetUserFormV8();
  await loadAll();
};
function bindSecurityV8(){
  if($('#userForm')) $('#userForm').onsubmit=saveUser;
  if($('#cancelUserEdit')) $('#cancelUserEdit').onclick=resetUserFormV8;
  if($('#userRole')) $('#userRole').onchange=()=>renderPermissionGridV8(getRoleTemplateV8($('#userRole').value));
  if($('#applyRoleTemplate')) $('#applyRoleTemplate').onclick=()=>renderPermissionGridV8(getRoleTemplateV8($('#userRole')?.value||'CAJERO'));
  if($('#userSearch')) $('#userSearch').oninput=renderUsers;
  renderPermissionGridV8(getRoleTemplateV8($('#userRole')?.value||'CAJERO'));
}
const bindV8Base = bind;
bind = function(){
  bindV8Base();
  bindSecurityV8();
  applyNavigationPermissionsV8();
};
setTimeout(()=>{bindSecurityV8(); applyNavigationPermissionsV8();},400);

/* =====================================================
   V13.1 - Corrección flujo real de contraseña y seguridad UX
   - Cambio obligatorio dentro del login, sin tocar base manual.
   - Reset de contraseña con modal interno, clave temporal aleatoria.
   - Alta de usuario entrega credenciales desde el sistema.
===================================================== */
function randomTemporaryPasswordV131(){
  const upper='ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower='abcdefghijkmnopqrstuvwxyz';
  const nums='23456789';
  const sym='@#$%';
  const all=upper+lower+nums+sym;
  const pick=s=>s[Math.floor(Math.random()*s.length)];
  let pass=pick(upper)+pick(lower)+pick(nums)+pick(sym);
  while(pass.length<10) pass+=pick(all);
  return pass.split('').sort(()=>Math.random()-0.5).join('');
}
function ensureSystemModalV131(){
  let wrap=document.getElementById('systemModalV131');
  if(wrap) return wrap;
  wrap=document.createElement('div');
  wrap.id='systemModalV131';
  wrap.className='system-modal-v131 hidden';
  wrap.innerHTML=`<div class="system-modal-card-v131">
    <div class="system-modal-head-v131"><h3 id="systemModalTitleV131"></h3><button id="systemModalCloseV131" type="button">×</button></div>
    <div id="systemModalBodyV131" class="system-modal-body-v131"></div>
    <div id="systemModalActionsV131" class="system-modal-actions-v131"></div>
  </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#systemModalCloseV131').onclick=()=>wrap.classList.add('hidden');
  return wrap;
}
function openSystemModalV131({title='',body='',actions=[]}){
  const wrap=ensureSystemModalV131();
  wrap.querySelector('#systemModalTitleV131').textContent=title;
  wrap.querySelector('#systemModalBodyV131').innerHTML=body;
  const actionsEl=wrap.querySelector('#systemModalActionsV131');
  actionsEl.innerHTML='';
  actions.forEach(a=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className=a.className||'ghost';
    btn.textContent=a.text||'Aceptar';
    btn.onclick=()=>a.onClick?.(wrap);
    actionsEl.appendChild(btn);
  });
  wrap.classList.remove('hidden');
  return wrap;
}
function showCredentialModalV131({title='Credenciales temporales',username='',password=''}){
  const safeUser=String(username||'');
  const safePass=String(password||'');
  const wrap=openSystemModalV131({
    title,
    body:`<p class="modal-note-v131">Entregue estos datos únicamente al usuario autorizado. La contraseña temporal debe cambiarse en el primer ingreso.</p>
      <div class="credential-box-v131"><span>Usuario</span><b>${safeUser}</b></div>
      <div class="credential-box-v131"><span>Contraseña temporal</span><b id="tempPasswordTextV131">••••••••••</b></div>
      <div class="modal-inline-actions-v131"><button type="button" id="showTempPasswordV131">Mostrar</button><button type="button" id="copyTempPasswordV131">Copiar contraseña</button></div>`,
    actions:[{text:'Aceptar',className:'primary',onClick:(m)=>m.classList.add('hidden')}]
  });
  const passEl=wrap.querySelector('#tempPasswordTextV131');
  wrap.querySelector('#showTempPasswordV131').onclick=()=>{
    const showing=passEl.textContent===safePass;
    passEl.textContent=showing?'••••••••••':safePass;
    wrap.querySelector('#showTempPasswordV131').textContent=showing?'Mostrar':'Ocultar';
  };
  wrap.querySelector('#copyTempPasswordV131').onclick=async()=>{
    try{ await navigator.clipboard.writeText(safePass); wrap.querySelector('#copyTempPasswordV131').textContent='Copiada'; }
    catch(_e){ passEl.textContent=safePass; }
  };
}
async function setTemporaryPasswordV131(user){
  const tempPass=randomTemporaryPasswordV131();
  const tempHash=await sha256V114(tempPass);
  const r=await sb.from('app_users').update({
    password_hash:tempHash,
    must_change_password:true,
    force_password_change:true,
    failed_login_attempts:0,
    locked_until:null,
    status:'active',
    updated_at:nowIsoV114()
  }).eq('id',user.id);
  if(r.error) throw r.error;
  try{ await auditLoginV114(user,'PASSWORD_RESET','SUCCESS','Contraseña temporal generada por administrador'); }catch(_e){}
  return tempPass;
}

// Reemplazo del flujo obligatorio: se muestra dentro del login, no como alerta perdida ni SQL manual.
showPasswordChangeV114 = function(user){
  pendingPasswordUserV114=user;
  passwordChangeModeV114='initial';
  const card=document.querySelector('.login-card');
  const loginForm=document.getElementById('loginForm');
  const note=document.querySelector('.login-security-note');
  if(loginForm) loginForm.classList.add('hidden');
  if(note) note.classList.add('hidden');
  let panel=document.getElementById('forcedPasswordPanelV131');
  if(!panel){
    panel=document.createElement('form');
    panel.id='forcedPasswordPanelV131';
    panel.className='forced-password-panel-v131';
    panel.innerHTML=`<div class="forced-head-v131"><h2>Cambio de contraseña requerido</h2><p>Por seguridad, debe crear una nueva contraseña antes de ingresar.</p></div>
      <label>Nueva contraseña</label>
      <input id="forcedNewPasswordV131" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" minlength="8" required>
      <label>Confirmar contraseña</label>
      <input id="forcedConfirmPasswordV131" type="password" autocomplete="new-password" placeholder="Repita la contraseña" minlength="8" required>
      <button class="primary wide" type="submit">Actualizar contraseña e ingresar</button>
      <button class="ghost wide" type="button" id="forcedBackLoginV131">Volver al ingreso</button>
      <div id="forcedPasswordMessageV131" class="login-message"></div>`;
    card.appendChild(panel);
    panel.onsubmit=changeForcedPasswordV131;
    panel.querySelector('#forcedBackLoginV131').onclick=()=>{
      pendingPasswordUserV114=null;
      panel.remove();
      if(loginForm) loginForm.classList.remove('hidden');
      if(note) note.classList.remove('hidden');
      setLoginMessageV114('');
      document.getElementById('loginPassword')?.focus();
    };
  }
  setLoginMessageV114('');
  setTimeout(()=>document.getElementById('forcedNewPasswordV131')?.focus(),80);
};
async function changeForcedPasswordV131(e){
  e.preventDefault();
  const msg=document.getElementById('forcedPasswordMessageV131');
  const setMsg=(t,ok=false)=>{ if(msg){ msg.textContent=t; msg.style.color=ok?'#86efac':'#fca5a5'; } };
  const user=pendingPasswordUserV114;
  if(!user?.id){ setMsg('Sesión temporal no encontrada. Vuelva a iniciar sesión.'); return; }
  const p1=document.getElementById('forcedNewPasswordV131')?.value||'';
  const p2=document.getElementById('forcedConfirmPasswordV131')?.value||'';
  if(p1.length<8){ setMsg('La contraseña debe tener al menos 8 caracteres.'); return; }
  if(p1!==p2){ setMsg('Las contraseñas no coinciden.'); return; }
  if(p1==='123456'){ setMsg('Use una contraseña diferente a la temporal.'); return; }
  const hash=await sha256V114(p1);
  const updated={...user,password_hash:hash,must_change_password:false,force_password_change:false,last_login_at:nowIsoV114(),failed_login_attempts:0,locked_until:null};
  try{
    const r=await sb.from('app_users').update({
      password_hash:hash,
      must_change_password:false,
      force_password_change:false,
      failed_login_attempts:0,
      locked_until:null,
      last_login_at:nowIsoV114(),
      updated_at:nowIsoV114()
    }).eq('id',user.id);
    if(r.error) throw r.error;
  }catch(err){ console.error(err); setMsg('No se pudo actualizar la contraseña. Revise permisos de Supabase.'); return; }
  try{ await auditLoginV114(updated,'PASSWORD_CHANGE','SUCCESS','Cambio obligatorio completado desde login'); }catch(_e){}
  setMsg('Contraseña actualizada. Ingresando...',true);
  pendingPasswordUserV114=null;
  setTimeout(()=>applySessionV114(updated),350);
}

// Reset profesional, sin confirm/alert del navegador y sin contraseña fija 123456.
window.resetUserPasswordV8 = async function(id){
  if(!guardAdmin()) return;
  const u=users.find(x=>x.id===id); if(!u) return;
  openSystemModalV131({
    title:'Restablecer contraseña',
    body:`<p class="modal-note-v131">Se generará una contraseña temporal aleatoria y el usuario deberá cambiarla al iniciar sesión.</p>
      <div class="credential-box-v131"><span>Usuario</span><b>${u.name||'Usuario del sistema'}</b></div>
      <div class="warning-box-v131">La contraseña temporal se mostrará una sola vez para entrega segura.</div>`,
    actions:[
      {text:'Cancelar',className:'ghost',onClick:(m)=>m.classList.add('hidden')},
      {text:'Restablecer contraseña',className:'primary',onClick:async(m)=>{
        try{
          const temp=await setTemporaryPasswordV131(u);
          m.classList.add('hidden');
          await loadAll();
          showCredentialModalV131({title:'Contraseña restablecida',username:u.username,password:temp});
        }catch(err){ console.error(err); alert(err.message||'No se pudo restablecer la contraseña.'); }
      }}
    ]
  });
};

// Alta de usuario con contraseña temporal aleatoria y entrega desde el sistema.
saveUser = async function(e){
  e.preventDefault(); if(!guardAdmin()) return;
  const id=document.getElementById('userId')?.value || editingUserIdV8;
  const name=document.getElementById('userName')?.value?.trim();
  const accessUsername=normalizeUserV114(document.getElementById('userUsername')?.value || generateAccessUserV9());
  const email=document.getElementById('userEmail')?.value?.trim()||null;
  const phone=document.getElementById('userPhone')?.value?.trim()||null;
  const role=String(document.getElementById('userRole')?.value||'CAJERO').toUpperCase();
  const status=normalizeStatusV8(document.getElementById('userStatus')?.value);
  const permissions=readPermissionGridV8();
  if(!name){ alert('Ingrese el nombre del usuario.'); return; }
  if(id){
    const r=await sb.from('app_users').update({name,username:accessUsername,email,phone,role,status,permissions,updated_at:nowIsoV114()}).eq('id',id);
    if(r.error) return alert(r.error.message);
    resetUserFormV8();
    await loadAll();
    return;
  }
  const tempPass=randomTemporaryPasswordV131();
  const tempHash=await sha256V114(tempPass);
  const r=await sb.from('app_users').insert({
    name,email,phone,username:accessUsername,password_hash:tempHash,
    must_change_password:true,force_password_change:true,
    failed_login_attempts:0,locked_until:null,status,role,permissions
  }).select('id,username,name').maybeSingle();
  if(r.error) return alert(r.error.message);
  resetUserFormV8();
  await loadAll();
  showCredentialModalV131({title:'Usuario creado',username:accessUsername,password:tempPass});
};

// Texto correcto del formulario de usuarios.
try{
  const oldReset=resetUserFormV8;
  resetUserFormV8=function(){
    oldReset();
    if(document.getElementById('userFormHelp')) document.getElementById('userFormHelp').textContent='Al crear un usuario se genera una contraseña temporal aleatoria y cambio obligatorio. El acceso no se publica en la pantalla de login.';
  };
}catch(_e){}


/* =====================================================
   V13.2 - Autenticación sin SQL manual
   Causa corregida: RLS bloqueaba updates directos a app_users.
   Solución: RPC SECURITY DEFINER + mensajes de usuario limpios.
===================================================== */
function getCurrentActorIdV132(){
  try{
    const raw=localStorage.getItem('mm_session_user');
    const u=raw?JSON.parse(raw):null;
    return u?.id || currentUserV114?.id || null;
  }catch(_e){ return currentUserV114?.id || null; }
}
function friendlySecurityErrorV132(err){
  console.error('Detalle técnico de seguridad:', err);
  const msg=String(err?.message||err?.details||'');
  if(msg.includes('function') || msg.includes('does not exist')) return 'Falta ejecutar la actualización de seguridad del sistema.';
  if(msg.includes('permission') || msg.includes('RLS') || msg.includes('policy')) return 'No fue posible guardar el cambio por una política de seguridad. Avise al administrador.';
  return 'No fue posible completar la operación. Intente nuevamente o contacte al administrador.';
}
async function rpcChangePasswordV132({username,currentHash,newHash}){
  const r=await sb.rpc('mm_auth_change_password', {
    p_username: username,
    p_current_hash: currentHash,
    p_new_hash: newHash
  });
  if(r.error) throw r.error;
  const data=r.data || {};
  if(data.ok === false) throw new Error(data.message || 'No fue posible actualizar la contraseña.');
  return data.user || data;
}

// Reemplazo final del cambio obligatorio desde login.
changeForcedPasswordV131 = async function(e){
  e.preventDefault();
  const msg=document.getElementById('forcedPasswordMessageV131');
  const setMsg=(t,ok=false)=>{ if(msg){ msg.textContent=t; msg.style.color=ok?'#86efac':'#fca5a5'; } };
  const user=pendingPasswordUserV114;
  if(!user?.username){ setMsg('Sesión temporal no encontrada. Vuelva al ingreso e intente nuevamente.'); return; }
  const p1=document.getElementById('forcedNewPasswordV131')?.value||'';
  const p2=document.getElementById('forcedConfirmPasswordV131')?.value||'';
  if(p1.length<8){ setMsg('La contraseña debe tener al menos 8 caracteres.'); return; }
  if(p1!==p2){ setMsg('Las contraseñas no coinciden.'); return; }
  if(p1==='123456'){ setMsg('Use una contraseña diferente a la temporal.'); return; }
  const newHash=await sha256V114(p1);
  const currentHash=user.__login_hash || user.password_hash;
  setMsg('Actualizando contraseña...');
  try{
    const updated=await rpcChangePasswordV132({username:user.username,currentHash,newHash});
    setMsg('Contraseña actualizada. Ingresando...',true);
    pendingPasswordUserV114=null;
    setTimeout(()=>applySessionV114(updated),350);
  }catch(err){
    setMsg(friendlySecurityErrorV132(err));
  }
};

// Reemplazo final del cambio voluntario dentro del ERP.
changeInitialPasswordV114 = async function(e){
  e.preventDefault();
  if(!pendingPasswordUserV114){ setPasswordChangeMessageV114('Sesión no encontrada. Vuelva a iniciar sesión.'); return; }
  let user=pendingPasswordUserV114;
  const isVoluntary=passwordChangeModeV114==='voluntary';
  if(!isVoluntary){ return changeForcedPasswordV131(e); }
  try{ user=await findUserV114(user.username); }
  catch(_err){ setPasswordChangeMessageV114('No fue posible validar su usuario. Intente nuevamente.'); return; }
  if(!user){ setPasswordChangeMessageV114('Usuario no encontrado.'); return; }
  const currentPass=document.getElementById('currentPassword')?.value||'';
  const currentHash=await sha256V114(currentPass);
  const p1=document.getElementById('newPassword')?.value||'';
  const p2=document.getElementById('confirmPassword')?.value||'';
  if(p1.length<8){ setPasswordChangeMessageV114('La contraseña debe tener al menos 8 caracteres.'); return; }
  if(p1!==p2){ setPasswordChangeMessageV114('Las contraseñas no coinciden.'); return; }
  if(p1==='123456'){ setPasswordChangeMessageV114('Use una contraseña diferente a la temporal.'); return; }
  const newHash=await sha256V114(p1);
  setPasswordChangeMessageV114('Actualizando contraseña...');
  try{
    const updated=await rpcChangePasswordV132({username:user.username,currentHash,newHash});
    hidePasswordChangeV114();
    openSystemModalV131({
      title:'Contraseña actualizada',
      body:'<p class="modal-note-v131">La contraseña fue actualizada correctamente.</p>',
      actions:[{text:'Aceptar',className:'primary',onClick:(m)=>m.classList.add('hidden')}]
    });
    applySessionV114(updated);
  }catch(err){
    setPasswordChangeMessageV114(friendlySecurityErrorV132(err));
  }
};

async function adminSaveUserRpcV132(payload){
  const r=await sb.rpc('mm_admin_save_user', {
    p_actor_id: getCurrentActorIdV132(),
    p_user_id: payload.id || null,
    p_name: payload.name,
    p_username: payload.username,
    p_email: payload.email,
    p_phone: payload.phone,
    p_role: payload.role,
    p_status: payload.status,
    p_permissions: payload.permissions || {},
    p_temp_hash: payload.tempHash || null,
    p_force_change: payload.forceChange === true
  });
  if(r.error) throw r.error;
  const data=r.data || {};
  if(data.ok === false) throw new Error(data.message || 'No fue posible guardar el usuario.');
  return data.user || data;
}
async function adminSetUserStatusRpcV132(userId,status){
  const r=await sb.rpc('mm_admin_set_user_status', {
    p_actor_id:getCurrentActorIdV132(),
    p_user_id:userId,
    p_status:status
  });
  if(r.error) throw r.error;
  const data=r.data || {};
  if(data.ok === false) throw new Error(data.message || 'No fue posible cambiar el estado del usuario.');
  return data;
}
async function adminResetPasswordRpcV132(userId,tempHash){
  const r=await sb.rpc('mm_admin_reset_password', {
    p_actor_id:getCurrentActorIdV132(),
    p_user_id:userId,
    p_temp_hash:tempHash
  });
  if(r.error) throw r.error;
  const data=r.data || {};
  if(data.ok === false) throw new Error(data.message || 'No fue posible restablecer la contraseña.');
  return data;
}

window.toggleUserStatusV8 = async function(id){
  if(!guardAdmin()) return;
  const u=users.find(x=>x.id===id); if(!u) return;
  const newStatus=normalizeStatusV8(u.status)==='active'?'inactive':'active';
  const action=newStatus==='inactive'?'Inactivar usuario':'Activar usuario';
  openSystemModalV131({
    title:action,
    body:`<p class="modal-note-v131">Se cambiará el estado de <b>${u.name||'Usuario del sistema'}</b>.</p>`,
    actions:[
      {text:'Cancelar',className:'ghost',onClick:(m)=>m.classList.add('hidden')},
      {text:action,className:newStatus==='inactive'?'danger':'primary',onClick:async(m)=>{
        try{ await adminSetUserStatusRpcV132(id,newStatus); m.classList.add('hidden'); await loadAll(); }
        catch(err){ openSystemModalV131({title:'No fue posible actualizar',body:`<p class="modal-note-v131">${friendlySecurityErrorV132(err)}</p>`,actions:[{text:'Aceptar',className:'primary',onClick:(x)=>x.classList.add('hidden')}]} ); }
      }}
    ]
  });
};

window.resetUserPasswordV8 = async function(id){
  if(!guardAdmin()) return;
  const u=users.find(x=>x.id===id); if(!u) return;
  openSystemModalV131({
    title:'Restablecer contraseña',
    body:`<p class="modal-note-v131">Se generará una contraseña temporal aleatoria y el usuario deberá cambiarla al iniciar sesión.</p>
      <div class="credential-box-v131"><span>Usuario</span><b>${u.name||'Usuario del sistema'}</b></div>
      <div class="warning-box-v131">La contraseña temporal se mostrará una sola vez.</div>`,
    actions:[
      {text:'Cancelar',className:'ghost',onClick:(m)=>m.classList.add('hidden')},
      {text:'Restablecer contraseña',className:'primary',onClick:async(m)=>{
        try{
          const temp=randomTemporaryPasswordV131();
          const tempHash=await sha256V114(temp);
          await adminResetPasswordRpcV132(id,tempHash);
          m.classList.add('hidden');
          await loadAll();
          showCredentialModalV131({title:'Contraseña restablecida',username:u.username,password:temp});
        }catch(err){ openSystemModalV131({title:'No fue posible restablecer',body:`<p class="modal-note-v131">${friendlySecurityErrorV132(err)}</p>`,actions:[{text:'Aceptar',className:'primary',onClick:(x)=>x.classList.add('hidden')}]} ); }
      }}
    ]
  });
};

saveUser = async function(e){
  e.preventDefault(); if(!guardAdmin()) return;
  const id=document.getElementById('userId')?.value || editingUserIdV8;
  const name=document.getElementById('userName')?.value?.trim();
  const accessUsername=normalizeUserV114(document.getElementById('userUsername')?.value || generateAccessUserV9());
  const email=document.getElementById('userEmail')?.value?.trim()||null;
  const phone=document.getElementById('userPhone')?.value?.trim()||null;
  const role=String(document.getElementById('userRole')?.value||'CAJERO').toUpperCase();
  const status=normalizeStatusV8(document.getElementById('userStatus')?.value);
  const permissions=readPermissionGridV8();
  if(!name){ openSystemModalV131({title:'Dato requerido',body:'<p class="modal-note-v131">Ingrese el nombre del usuario.</p>',actions:[{text:'Aceptar',className:'primary',onClick:(m)=>m.classList.add('hidden')} ]}); return; }
  try{
    if(id){
      await adminSaveUserRpcV132({id,name,username:accessUsername,email,phone,role,status,permissions});
      resetUserFormV8(); await loadAll();
      openSystemModalV131({title:'Usuario actualizado',body:'<p class="modal-note-v131">Los cambios fueron guardados correctamente.</p>',actions:[{text:'Aceptar',className:'primary',onClick:(m)=>m.classList.add('hidden')} ]});
      return;
    }
    const tempPass=randomTemporaryPasswordV131();
    const tempHash=await sha256V114(tempPass);
    await adminSaveUserRpcV132({name,username:accessUsername,email,phone,role,status,permissions,tempHash,forceChange:true});
    resetUserFormV8(); await loadAll();
    showCredentialModalV131({title:'Usuario creado',username:accessUsername,password:tempPass});
  }catch(err){
    openSystemModalV131({title:'No fue posible guardar',body:`<p class="modal-note-v131">${friendlySecurityErrorV132(err)}</p>`,actions:[{text:'Aceptar',className:'primary',onClick:(m)=>m.classList.add('hidden')} ]});
  }
};

setTimeout(()=>{
  const form=document.getElementById('passwordChangeForm');
  if(form) form.onsubmit=changeInitialPasswordV114;
  const userForm=document.getElementById('userForm');
  if(userForm) userForm.onsubmit=saveUser;
},900);

/* =========================================================
   V14 - Reportes financieros, exportación y estados básicos
   ========================================================= */
let businessExpensesV14 = [];
let currentReportV14 = {title:'Reporte', rows:[], columns:[], summary:{}};

function ensureReportsPermissionV14(){
  try{
    if(Array.isArray(PERMISSION_CATALOG_V8) && !PERMISSION_CATALOG_V8.some(([k])=>k==='reports')){
      const idx = PERMISSION_CATALOG_V8.findIndex(([k])=>k==='settings');
      if(idx>=0) PERMISSION_CATALOG_V8.splice(idx,0,['reports','Reportes']);
      else PERMISSION_CATALOG_V8.push(['reports','Reportes']);
    }
    if(typeof ROLE_PERMISSIONS_V8==='object'){
      ROLE_PERMISSIONS_V8.ADMIN = {...(ROLE_PERMISSIONS_V8.ADMIN||{}), reports:true};
      ROLE_PERMISSIONS_V8.SUPERVISOR = {...(ROLE_PERMISSIONS_V8.SUPERVISOR||{}), reports:true};
      ROLE_PERMISSIONS_V8.CAJERO = {...(ROLE_PERMISSIONS_V8.CAJERO||{}), reports:false};
      ROLE_PERMISSIONS_V8.BODEGA = {...(ROLE_PERMISSIONS_V8.BODEGA||{}), reports:false};
      ROLE_PERMISSIONS_V8.CONSULTA = {...(ROLE_PERMISSIONS_V8.CONSULTA||{}), reports:true};
    }
  }catch(e){console.warn('No se pudo extender permisos de reportes',e);}
}
ensureReportsPermissionV14();

function dateOnlyV14(v){return (v?new Date(v):new Date()).toISOString().slice(0,10)}
function startOfWeekV14(d){const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x;}
function monthKeyV14(d){const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;}
function weekKeyV14(d){const s=startOfWeekV14(d); return `${s.getFullYear()}-S${String(Math.ceil((((s-new Date(s.getFullYear(),0,1))/86400000)+1)/7)).padStart(2,'0')}`;}
function parseDateInputV14(id, fallback){const v=$('#'+id)?.value; return v?new Date(v+'T00:00:00'):fallback;}
function reportRangeV14(){
  const endDefault=new Date(); endDefault.setHours(23,59,59,999);
  const startDefault=new Date(); startDefault.setDate(startDefault.getDate()-30); startDefault.setHours(0,0,0,0);
  const start=parseDateInputV14('reportStart', startDefault);
  const end=parseDateInputV14('reportEnd', endDefault); end.setHours(23,59,59,999);
  return {start,end, unit:$('#reportBusinessUnit')?.value||'ALL'};
}
function saleUnitV14(s){
  if(s.business_unit_code) return String(s.business_unit_code).toUpperCase();
  if(s.business_unit_id) return String(s.business_unit_id).toUpperCase();
  const item=(saleItems||[]).find(i=>String(i.sale_id)===String(s.id));
  const p=item ? (products||[]).find(x=>String(x.id)===String(item.product_id)) : null;
  return String(p?.business_unit_code || p?.business_unit_id || p?.business_unit || 'FER').toUpperCase();
}
function productUnitV14(p){return String(p.business_unit_code || p.business_unit_id || p.business_unit || 'FER').toUpperCase();}
function inUnitV14(code, unit){return unit==='ALL' || String(code||'').toUpperCase()===unit;}
function salesInRangeV14(start,end,unit='ALL'){
  return (sales||[]).filter(s=>{
    const d=new Date(s.created_at||s.sale_date||0);
    return d>=start && d<=end && inUnitV14(saleUnitV14(s),unit);
  });
}
function expensesInRangeV14(start,end,unit='ALL'){
  return (businessExpensesV14||[]).filter(e=>{
    const d=new Date((e.expense_date||e.created_at||todayISO())+'T00:00:00');
    const u=String(e.business_unit_code||e.business_unit_id||'GENERAL').toUpperCase();
    return d>=start && d<=end && (unit==='ALL' || u===unit || u==='GENERAL');
  });
}
function inventoryByUnitV14(unit='ALL'){
  return (products||[]).filter(p=>inUnitV14(productUnitV14(p), unit));
}
function setDefaultReportDatesV14(){
  const s=$('#reportStart'), e=$('#reportEnd'), exp=$('#expenseDate');
  if(s && !s.value){const d=new Date(); d.setDate(d.getDate()-30); s.value=d.toISOString().slice(0,10);}
  if(e && !e.value) e.value=todayISO();
  if(exp && !exp.value) exp.value=todayISO();
}
function summarizeReportV14(rows){return rows.reduce((a,r)=>{a.revenue+=Number(r.total||r.ingresos||0); a.profit+=Number(r.profit||r.utilidad_bruta||0); a.expenses+=Number(r.gastos||r.amount||0); return a;},{revenue:0,profit:0,expenses:0});}
function groupByV14(list, keyFn, mapper){
  const map=new Map();
  list.forEach(x=>{
    const k=keyFn(x); const prev=map.get(k)||{}; map.set(k, mapper(prev,x,k));
  });
  return [...map.values()].sort((a,b)=>String(a.periodo||a.fecha||a.mes||a.semana).localeCompare(String(b.periodo||b.fecha||b.mes||b.semana)));
}
function buildSalesReportV14(type,start,end,unit){
  const list=salesInRangeV14(start,end,unit);
  const keyer = type==='daily_sales' ? (s=>dateOnlyV14(s.created_at)) : type==='weekly_sales' ? (s=>weekKeyV14(s.created_at)) : (s=>monthKeyV14(s.created_at));
  const label = type==='daily_sales' ? 'fecha' : type==='weekly_sales' ? 'semana' : 'mes';
  const rows=groupByV14(list,keyer,(p,s,k)=>({
    [label]:k,
    facturas:Number(p.facturas||0)+1,
    total:Number(p.total||0)+Number(s.total||0),
    utilidad:Number(p.utilidad||0)+Number(s.profit_total||0),
    efectivo:Number(p.efectivo||0)+(String(s.payment_method||'').includes('EFECTIVO')?Number(s.total||0):0),
    tarjeta:Number(p.tarjeta||0)+(String(s.payment_method||'').includes('TARJETA')?Number(s.total||0):0),
    transferencia:Number(p.transferencia||0)+(String(s.payment_method||'').includes('TRANSFER')?Number(s.total||0):0)
  }));
  return {title:type==='daily_sales'?'Ventas diarias':type==='weekly_sales'?'Ventas semanales':'Ventas mensuales', columns:[label,'facturas','total','utilidad','efectivo','tarjeta','transferencia'], rows};
}
function buildExpensesReportV14(start,end,unit){
  const rows=expensesInRangeV14(start,end,unit).map(e=>({fecha:e.expense_date||dateOnlyV14(e.created_at), categoria:e.category||'Otros', descripcion:e.description||'', unidad:e.business_unit_code||'GENERAL', monto:Number(e.amount||0)}));
  return {title:'Informe de gastos', columns:['fecha','categoria','descripcion','unidad','monto'], rows};
}
function buildInventoryReportV14(unit){
  const rows=inventoryByUnitV14(unit).map(p=>({codigo:p.internal_code||p.barcode||'', producto:p.name||'', unidad:productUnitV14(p), stock:Number(p.stock||0), minimo:Number(p.min_stock||0), costo:Number(p.purchase_price||0), precio:Number(p.sale_price||0), valor_costo:Number(p.stock||0)*Number(p.purchase_price||0), margen: Number(p.purchase_price||0)>0?(((Number(p.sale_price||0)-Number(p.purchase_price||0))/Number(p.purchase_price||0))*100).toFixed(2)+'%':'0%'}));
  return {title:'Informe de inventario', columns:['codigo','producto','unidad','stock','minimo','costo','precio','valor_costo','margen'], rows};
}
function buildIncomeStatementV14(start,end,unit){
  const s=salesInRangeV14(start,end,unit);
  const e=expensesInRangeV14(start,end,unit);
  const ingresos=s.reduce((a,x)=>a+Number(x.total||0),0);
  const utilidadBruta=s.reduce((a,x)=>a+Number(x.profit_total||0),0);
  const costoVentas=Math.max(0, ingresos-utilidadBruta);
  const gastos=e.reduce((a,x)=>a+Number(x.amount||0),0);
  const utilidadNeta=utilidadBruta-gastos;
  return {title:'Estado de resultados', columns:['concepto','monto'], rows:[
    {concepto:'Ingresos por ventas', monto:ingresos},
    {concepto:'Costo estimado de ventas', monto:costoVentas},
    {concepto:'Utilidad bruta', monto:utilidadBruta},
    {concepto:'Gastos operativos', monto:gastos},
    {concepto:'Utilidad neta estimada', monto:utilidadNeta}
  ]};
}
function buildBalanceSheetV14(start,end,unit){
  const inv=inventoryByUnitV14(unit).reduce((a,p)=>a+Number(p.stock||0)*Number(p.purchase_price||0),0);
  const s=salesInRangeV14(start,end,unit);
  const cash=s.filter(x=>String(x.payment_method||'').includes('EFECTIVO')).reduce((a,x)=>a+Number(x.total||0),0);
  const card=s.filter(x=>String(x.payment_method||'').includes('TARJETA')).reduce((a,x)=>a+Number(x.total||0),0);
  const transfer=s.filter(x=>String(x.payment_method||'').includes('TRANSFER')).reduce((a,x)=>a+Number(x.total||0),0);
  const expenses=expensesInRangeV14(start,end,unit).reduce((a,x)=>a+Number(x.amount||0),0);
  const assets=cash+card+transfer+inv-expenses;
  return {title:'Balance general básico', columns:['grupo','concepto','monto'], rows:[
    {grupo:'Activo', concepto:'Efectivo generado en periodo', monto:cash},
    {grupo:'Activo', concepto:'Ventas por tarjeta por cobrar / conciliación', monto:card},
    {grupo:'Activo', concepto:'Transferencias por conciliar', monto:transfer},
    {grupo:'Activo', concepto:'Inventario valorizado al costo', monto:inv},
    {grupo:'Pasivo', concepto:'Gastos registrados del periodo', monto:expenses},
    {grupo:'Patrimonio', concepto:'Resultado acumulado estimado', monto:assets}
  ]};
}
function renderReportV14(){
  setDefaultReportDatesV14();
  const type=$('#reportType')?.value||'daily_sales';
  const {start,end,unit}=reportRangeV14();
  let result;
  if(['daily_sales','weekly_sales','monthly_sales'].includes(type)) result=buildSalesReportV14(type,start,end,unit);
  if(type==='expenses') result=buildExpensesReportV14(start,end,unit);
  if(type==='inventory') result=buildInventoryReportV14(unit);
  if(type==='income_statement') result=buildIncomeStatementV14(start,end,unit);
  if(type==='balance_sheet') result=buildBalanceSheetV14(start,end,unit);
  currentReportV14=result||{title:'Reporte', columns:[], rows:[]};
  const rows=currentReportV14.rows||[], cols=currentReportV14.columns||[];
  $('#reportTitle').textContent=currentReportV14.title;
  $('#reportSubtitle').textContent=`Periodo ${start.toISOString().slice(0,10)} al ${end.toISOString().slice(0,10)} · ${unit==='ALL'?'Todas las unidades':unit}`;
  $('#reportTable').innerHTML = '<tr>'+cols.map(c=>`<th>${escapeHtmlV14(labelV14(c))}</th>`).join('')+'</tr>' + rows.map(r=>'<tr>'+cols.map(c=>`<td>${formatReportCellV14(c,r[c])}</td>`).join('')+'</tr>').join('');
  renderReportKpisV14(start,end,unit);
  renderReportSummaryV14(currentReportV14);
}
function labelV14(k){return String(k).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())}
function escapeHtmlV14(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function formatReportCellV14(k,v){
  if(['total','utilidad','efectivo','tarjeta','transferencia','monto','costo','precio','valor_costo'].includes(k)) return money(v);
  return escapeHtmlV14(v);
}
function renderReportKpisV14(start,end,unit){
  const s=salesInRangeV14(start,end,unit), e=expensesInRangeV14(start,end,unit), inv=inventoryByUnitV14(unit);
  const revenue=s.reduce((a,x)=>a+Number(x.total||0),0), profit=s.reduce((a,x)=>a+Number(x.profit_total||0),0), expenses=e.reduce((a,x)=>a+Number(x.amount||0),0), inventory=inv.reduce((a,p)=>a+Number(p.stock||0)*Number(p.purchase_price||0),0);
  if($('#reportKpiRevenue')) $('#reportKpiRevenue').textContent=money(revenue);
  if($('#reportKpiProfit')) $('#reportKpiProfit').textContent=money(profit);
  if($('#reportKpiExpenses')) $('#reportKpiExpenses').textContent=money(expenses);
  if($('#reportKpiInventory')) $('#reportKpiInventory').textContent=money(inventory);
}
function renderReportSummaryV14(report){
  if(!$('#reportSummary')) return;
  if(['Estado de resultados','Balance general básico'].includes(report.title)){
    $('#reportSummary').innerHTML=(report.rows||[]).map(r=>`<div><span>${escapeHtmlV14(r.concepto)}</span><strong>${money(r.monto)}</strong></div>`).join('');
  }else $('#reportSummary').innerHTML=`<div><span>Registros</span><strong>${(report.rows||[]).length}</strong></div>`;
}
async function saveExpenseV14(e){
  e.preventDefault();
  const payload={expense_date:$('#expenseDate').value||todayISO(), description:$('#expenseDescription').value.trim(), category:$('#expenseCategory').value, amount:Number($('#expenseAmount').value||0), business_unit_code:$('#expenseUnit').value};
  if(!payload.description || payload.amount<=0) return notifyV14('Completa la descripción y monto del gasto. Hasta los gastos necesitan identidad.','error');
  const r=await sb.from('business_expenses').insert(payload).select().single();
  if(r.error){console.error(r.error); return notifyV14('No se pudo guardar el gasto. Verifica que ejecutaste el SQL de reportes.','error');}
  businessExpensesV14.unshift(r.data); $('#expenseForm').reset(); setDefaultReportDatesV14(); renderReportV14(); notifyV14('Gasto registrado correctamente.','ok');
}
function notifyV14(msg,type='ok'){
  if(typeof showToastV1043==='function') showToastV1043(msg,type);
  else alert(msg);
}
function csvEscapeV14(v){return `"${String(v??'').replaceAll('"','""')}"`;}
function exportReportCsvV14(){
  const {title,columns,rows}=currentReportV14; if(!rows?.length) return notifyV14('No hay datos para exportar.','error');
  const csv=[columns.map(labelV14).map(csvEscapeV14).join(','),...rows.map(r=>columns.map(c=>csvEscapeV14(r[c])).join(','))].join('\n');
  downloadBlobV14(csv, `${slugV14(title)}_${todayISO()}.csv`, 'text/csv;charset=utf-8;');
}
function exportReportExcelV14(){
  const {title,columns,rows}=currentReportV14; if(!rows?.length) return notifyV14('No hay datos para exportar.','error');
  const html=`<html><head><meta charset="utf-8"></head><body><table><tr>${columns.map(c=>`<th>${escapeHtmlV14(labelV14(c))}</th>`).join('')}</tr>${rows.map(r=>`<tr>${columns.map(c=>`<td>${escapeHtmlV14(r[c])}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
  downloadBlobV14(html, `${slugV14(title)}_${todayISO()}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
}
function slugV14(s){return String(s||'reporte').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function downloadBlobV14(content, filename, type){const blob=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},300);}

const loadAllV14Base = loadAll;
loadAll = async function(){
  await loadAllV14Base();
  businessExpensesV14 = await safeLoad('business_expenses','*','expense_date');
  if($('#reports')?.classList.contains('show')) renderReportV14();
};
const bindV14Base = bind;
bind = function(){
  bindV14Base(); ensureReportsPermissionV14();
  if($('#generateReportBtn')) $('#generateReportBtn').onclick=renderReportV14;
  if($('#exportReportCsvBtn')) $('#exportReportCsvBtn').onclick=exportReportCsvV14;
  if($('#exportReportExcelBtn')) $('#exportReportExcelBtn').onclick=exportReportExcelV14;
  if($('#expenseForm')) $('#expenseForm').onsubmit=saveExpenseV14;
  ['reportType','reportStart','reportEnd','reportBusinessUnit'].forEach(id=>{const el=$('#'+id); if(el) el.onchange=renderReportV14;});
  setDefaultReportDatesV14();
};
const showViewV14Base = showView;
showView = function(id,btn){
  showViewV14Base(id,btn);
  if(id==='reports'){ensureReportsPermissionV14(); setDefaultReportDatesV14(); renderReportV14();}
};
setTimeout(()=>{try{bind(); ensureReportsPermissionV14(); if($('#reports')?.classList.contains('show')) renderReportV14();}catch(e){console.warn('Init reportes V14',e);}},300);

/* ==========================================================
   V10.03-PATCH - POS, Configuración comercial, Caja US$, Mesa de Cambio
   Cambios funcionales solicitados:
   - Métodos oficiales: EFECTIVO, TARJETA, TRANSFERENCIA BANCARIA, MIXTO.
   - Descuento configurable por efectivo/transferencia.
   - Pago mixto con detalle efectivo/tarjeta/transferencia y referencia.
   - Arqueo compacto con desglose C$ y US$.
   - Mesa de Cambio compatible con columnas nuevas y alias customer_document.
   ========================================================== */
const DEFAULT_COMMERCIAL_POLICY_V1003={cash_discount_percent:7,transfer_discount_percent:0,card_fee_included:true,require_transfer_reference:true};
function policyV1003(){
  try{return {...DEFAULT_COMMERCIAL_POLICY_V1003,...JSON.parse(localStorage.getItem('mym_commercial_policy')||'{}')};}
  catch(_){return {...DEFAULT_COMMERCIAL_POLICY_V1003};}
}
function savePolicyV1003(p){localStorage.setItem('mym_commercial_policy',JSON.stringify({...policyV1003(),...p}));}
function moneyPlainV1003(n){return Math.round(Number(n||0));}
function paymentMethodV1003(){return ($('#paymentMethod')?.value||'EFECTIVO').toUpperCase();}
function subtotalV1003(){return cartSubtotal();}
function splitAmountsV1003(){
  const method=paymentMethodV1003();
  const totalBefore=saleTotalBeforeAutoDiscountV1003();
  const cash=Number($('#payCashAmount')?.value||0);
  const card=Number($('#payCardAmount')?.value||0);
  const transfer=Number($('#payTransferAmount')?.value||0);
  if(method==='EFECTIVO') return {cash:Number($('#amountReceived')?.value||0),card:0,transfer:0};
  if(method==='TARJETA') return {cash:0,card:totalBefore,transfer:0};
  if(method==='TRANSFERENCIA BANCARIA' || method==='TRANSFERENCIA') return {cash:0,card:0,transfer:totalBefore};
  return {cash,card,transfer};
}
function autoDiscountV1003(){
  const p=policyV1003();
  const method=paymentMethodV1003();
  const subtotal=subtotalV1003();
  if(method==='EFECTIVO') return subtotal*(Number(p.cash_discount_percent||0)/100);
  if(method==='TRANSFERENCIA BANCARIA' || method==='TRANSFERENCIA') return subtotal*(Number(p.transfer_discount_percent||0)/100);
  if(method==='MIXTO'){
    const s=splitAmountsV1003();
    return (s.cash*(Number(p.cash_discount_percent||0)/100))+(s.transfer*(Number(p.transfer_discount_percent||0)/100));
  }
  return 0;
}
function saleTotalBeforeAutoDiscountV1003(){return Math.max(0,cartSubtotal()-Number($('#saleDiscount')?.value||0));}
saleDiscount=function(){return Number($('#saleDiscount')?.value||0)+autoDiscountV1003();};
saleTotal=function(){return Math.max(0,cartSubtotal()-saleDiscount());};
function paymentBalanceV1003(){
  const s=splitAmountsV1003();
  return { ...s, paid:s.cash+s.card+s.transfer, total:saleTotal(), diff:(s.cash+s.card+s.transfer)-saleTotal() };
}
function buildPaymentUIV1003(){
  const box=$('.paymentBox'); if(!box || box.dataset.v1003==='1') return;
  box.dataset.v1003='1';
  box.innerHTML=`
    <label>Forma de pago<select id="paymentMethod">
      <option value="EFECTIVO">EFECTIVO</option>
      <option value="TARJETA">TARJETA</option>
      <option value="TRANSFERENCIA BANCARIA">TRANSFERENCIA BANCARIA</option>
      <option value="MIXTO">MIXTO</option>
    </select></label>
    <div id="singlePaymentBox" class="payment-single-v1003"><input id="amountReceived" type="number" min="0" step="1" placeholder="Recibido"></div>
    <div id="mixedPaymentBox" class="payment-mixed-v1003 hidden">
      <label>Efectivo C$<input id="payCashAmount" type="number" min="0" step="1" placeholder="C$ 0"></label>
      <label>Tarjeta C$<input id="payCardAmount" type="number" min="0" step="1" placeholder="C$ 0"></label>
      <label>Transferencia C$<input id="payTransferAmount" type="number" min="0" step="1" placeholder="C$ 0"></label>
    </div>
    <input id="paymentReference" placeholder="Referencia de transferencia / voucher">
    <select id="bankAccount" class="hidden"></select>
    <div class="payment-policy-note" id="paymentPolicyNote">Precio incluye costo de tarjeta. Efectivo aplica descuento configurable.</div>
    <div class="change">Cambio / Diferencia: <b id="changePreview">C$ 0</b></div>`;
  ['paymentMethod','amountReceived','payCashAmount','payCardAmount','payTransferAmount','paymentReference','saleDiscount'].forEach(id=>{
    const el=$('#'+id); if(el){el.oninput=()=>{renderPaymentDetails();renderCart();}; el.onchange=()=>{renderPaymentDetails();renderCart();};}
  });
}
renderPaymentDetails=function(){
  const m=paymentMethodV1003(); const p=policyV1003();
  $('#singlePaymentBox')?.classList.toggle('hidden',m==='MIXTO' || m==='TARJETA' || m==='TRANSFERENCIA BANCARIA');
  $('#mixedPaymentBox')?.classList.toggle('hidden',m!=='MIXTO');
  $('#bankAccount')?.classList.toggle('hidden',!(m==='TRANSFERENCIA BANCARIA'||m==='MIXTO'));
  if($('#paymentReference')){
    $('#paymentReference').placeholder=(m==='TRANSFERENCIA BANCARIA'||m==='MIXTO')?'Referencia de transferencia':'Voucher / referencia opcional';
  }
  const note=$('#paymentPolicyNote');
  if(note) note.textContent=`Descuento efectivo: ${Number(p.cash_discount_percent||0)}% · Transferencia: ${Number(p.transfer_discount_percent||0)}% · Tarjeta: sin descuento`;
};
const renderCartBaseV1003=renderCart;
renderCart=function(){
  renderCartBaseV1003();
  const auto=autoDiscountV1003();
  const total=saleTotal();
  if($('#cartTotal')) $('#cartTotal').textContent=money(total);
  const bal=paymentBalanceV1003();
  if($('#changePreview')){
    if(paymentMethodV1003()==='MIXTO') $('#changePreview').textContent=money(bal.diff);
    else $('#changePreview').textContent=money(Math.max(0,Number($('#amountReceived')?.value||0)-total));
  }
  let badge=$('#autoDiscountBadgeV1003');
  if(!badge && document.querySelector('.totals')){
    badge=document.createElement('div'); badge.id='autoDiscountBadgeV1003'; badge.className='auto-discount-v1003';
    document.querySelector('.totals').appendChild(badge);
  }
  if(badge) badge.innerHTML=`<span>Descuento automático por forma de pago</span><b>${money(auto)}</b>`;
};
function validatePaymentV1003(){
  const method=paymentMethodV1003(), total=saleTotal(), bal=paymentBalanceV1003(), ref=($('#paymentReference')?.value||'').trim(), p=policyV1003();
  if(method==='EFECTIVO' && Number($('#amountReceived')?.value||0)<total) return 'Monto recibido menor al total.';
  if((method==='TRANSFERENCIA BANCARIA' || (method==='MIXTO' && bal.transfer>0)) && p.require_transfer_reference && !ref) return 'La transferencia bancaria requiere número de referencia.';
  if(method==='MIXTO' && Math.abs(bal.diff)>0.009) return `El pago mixto no cuadra. Diferencia: ${money(bal.diff)}.`;
  return '';
}
finishSale=async function(){
  if(!cart.length) return showToastV1043('Carrito vacío.','warning');
  const sessionId=$('#activeCashBox')?.value; if(!sessionId) return showToastV1043('Debes abrir o seleccionar caja antes de vender.','warning');
  const err=validatePaymentV1003(); if(err) return showToastV1043(err,'warning');
  const method=paymentMethodV1003(), bal=paymentBalanceV1003(), total=saleTotal();
  const profit=cart.reduce((a,i)=>a+((i.unit_price-i.unit_cost)*Number(i.qty)),0);
  const basePayload={invoice_no:'MM-'+Date.now(),customer_id:selectedCustomer?.id||null,customer_name:selectedCustomer?.name||($('#customerSearch')?.value||'').trim()||'Cliente eventual',customer_phone:selectedCustomer?.phone||null,payment_method:method,subtotal:cartSubtotal(),discount:saleDiscount(),tax:0,total,amount_received:method==='MIXTO'?bal.paid:Number($('#amountReceived')?.value||total),change_amount:method==='EFECTIVO'?Math.max(0,Number($('#amountReceived')?.value||0)-total):0,status:'COMPLETED',invoice_type:'TICKET',payment_reference:$('#paymentReference')?.value||null,cash_session_id:sessionId,profit_total:profit};
  const extended={...basePayload,payment_cash_amount:bal.cash,payment_card_amount:bal.card,payment_transfer_amount:bal.transfer,auto_discount_amount:autoDiscountV1003(),commercial_policy:policyV1003()};
  let {data:sale,error:se}=await sb.from('sales').insert(extended).select().single();
  if(se && String(se.message||'').includes('payment_cash_amount')) ({data:sale,error:se}=await sb.from('sales').insert(basePayload).select().single());
  if(se) return showToastV1043(se.message,'error');
  const items=cart.map(i=>({sale_id:sale.id,product_id:i.id,product_code:i.internal_code,product_name:i.name,quantity:i.qty,unit_price:i.unit_price,discount:0,total:Number(i.qty)*i.unit_price,unit_cost:i.unit_cost,profit_amount:(i.unit_price-i.unit_cost)*Number(i.qty),profit_margin:i.unit_cost>0?((i.unit_price-i.unit_cost)/i.unit_cost)*100:0,business_unit_id:i.business_unit_id||productBusinessUnitObjV104(i).id}));
  const {error:ie}=await sb.from('sale_items').insert(items);
  if(ie) return showToastV1043(ie.message,'error');
  for(const i of cart){
    await sb.from('products').update({stock:Number(i.stock)-Number(i.qty)}).eq('id',i.id);
    await sb.from('inventory_movements').insert({product_id:i.id,movement_type:'SALIDA',quantity:i.qty,reference:sale.invoice_no,notes:'Venta POS V10.03'});
  }
  lastSale={...sale,...extended,items,customer_name:basePayload.customer_name,customer_phone:basePayload.customer_phone};
  renderTicket(lastSale); $('#ticketModal')?.classList.remove('hidden');
  cart=[]; selectedCustomer=null; if($('#customerSearch')) $('#customerSearch').value=''; ['amountReceived','saleDiscount','paymentReference','payCashAmount','payCardAmount','payTransferAmount'].forEach(id=>{if($('#'+id)) $('#'+id).value=id==='saleDiscount'?'0':'';});
  await loadAll();
};
if($('#finishSale')) $('#finishSale').onclick=finishSale;

function renderSettingsV1003(){
  const p=policyV1003(); const view=$('#settings'); if(!view) return;
  view.innerHTML=`<div class="panel settings-policy-v1003"><h3>Configuración comercial</h3><p>Los precios ya incluyen el costo de tarjeta. El sistema aplica descuento solo cuando la forma de pago lo permita.</p><div class="settings-grid-v1003"><label>Descuento por efectivo %<input id="cfgCashDiscount" type="number" min="0" max="100" step="0.01" value="${Number(p.cash_discount_percent||0)}"></label><label>Descuento por transferencia %<input id="cfgTransferDiscount" type="number" min="0" max="100" step="0.01" value="${Number(p.transfer_discount_percent||0)}"></label><label><input id="cfgCardFeeIncluded" type="checkbox" ${p.card_fee_included?'checked':''}> Precio incluye costo de tarjeta</label><label><input id="cfgRequireTransferRef" type="checkbox" ${p.require_transfer_reference?'checked':''}> Transferencia requiere referencia</label></div><button id="saveCommercialPolicy" class="primary">Guardar política comercial</button></div><div class="panel"><h3>Seguridad</h3><div class="toolbar"><button id="changePasswordBtn" class="primary" type="button">Cambiar mi contraseña</button></div></div>`;
  $('#saveCommercialPolicy').onclick=()=>{savePolicyV1003({cash_discount_percent:Number($('#cfgCashDiscount').value||0),transfer_discount_percent:Number($('#cfgTransferDiscount').value||0),card_fee_included:$('#cfgCardFeeIncluded').checked,require_transfer_reference:$('#cfgRequireTransferRef').checked}); showToastV1043('Política comercial guardada.','success'); renderCart();};
  if(typeof bindPasswordButtonV132==='function') bindPasswordButtonV132();
}
const showViewBaseV1003=showView;
showView=function(id,btn){showViewBaseV1003(id,btn); if(id==='settings') renderSettingsV1003(); if(id==='pos'){buildPaymentUIV1003(); renderPaymentDetails(); renderCart();}};

const denominationsNioV1003=[1000,500,200,100,50,20,10,5,1];
const denominationsUsdV1003=[100,50,20,10,5,1];
let activeBreakdownCurrencyV1003='NIO';
window.openCashBreakdown=function(currency='NIO'){
  activeBreakdownCurrencyV1003=currency;
  const values=currency==='USD'?denominationsUsdV1003:denominationsNioV1003;
  const prefix=currency==='USD'?'US$':'C$';
  const list=$('#denominationList'); if(!list) return;
  const title=document.querySelector('#cashBreakdownModal .modal-header h3'); if(title) title.textContent=`Desglose de efectivo ${prefix}`;
  list.innerHTML=values.map(v=>`<div class="denomination-row"><span class="denomination-value">${prefix} ${v}</span><input type="number" min="0" step="1" value="0" data-value="${v}" oninput="calculateBreakdownTotal()"><strong class="denomination-subtotal">${prefix} 0</strong></div>`).join('');
  $('#cashBreakdownModal')?.classList.remove('hidden'); calculateBreakdownTotal();
};
window.calculateBreakdownTotal=function(){
  let total=0; const prefix=activeBreakdownCurrencyV1003==='USD'?'US$':'C$';
  document.querySelectorAll('#denominationList input').forEach(input=>{const subtotal=Number(input.dataset.value)*Number(input.value||0); const el=input.closest('.denomination-row')?.querySelector('.denomination-subtotal'); if(el) el.textContent=prefix+' '+subtotal.toLocaleString('es-NI'); total+=subtotal;});
  if($('#breakdownTotal')) $('#breakdownTotal').textContent=prefix+' '+total.toLocaleString('es-NI');
};
window.applyCashBreakdown=function(){
  const txt=($('#breakdownTotal')?.textContent||'0').replace('C$','').replace('US$','').replaceAll(',','').trim();
  if(activeBreakdownCurrencyV1003==='USD') $('#countedCashUsd').value=Number(txt||0).toFixed(2); else $('#countedCash').value=Math.ceil(Number(txt||0));
  updateClosingCashSummaryV84(); closeCashBreakdown();
};
function patchCashUsdButtonV1003(){
  const usd=$('#countedCashUsd'); if(!usd || usd.dataset.v1003==='1') return; usd.dataset.v1003='1';
  const label=usd.closest('label'); if(label){label.innerHTML='Efectivo contado US$<div class="input-action"><input id="countedCashUsd" class="form-control" type="number" min="0" step="0.01" placeholder="US$ 0.00"><button type="button" onclick="openCashBreakdown(\'USD\')">Desglose</button></div>';}
  const c=$('#countedCash')?.closest('label')?.querySelector('button'); if(c) c.setAttribute('onclick',"openCashBreakdown('NIO')");
}
const renderCashBaseV1003=renderCash;
renderCash=function(){renderCashBaseV1003(); patchCashUsdButtonV1003();};

const submitExchangeBaseV1003=submitExchangeV111;
submitExchangeV111=async function(e){
  e.preventDefault();
  syncExchangeRatesToFormV112();
  const sessionId=$('#exchangeCashSession')?.value || $('#activeCashBox')?.value;
  if(!sessionId) return showToastV1043('Debes abrir o seleccionar una caja antes de operar Mesa de Cambio.','warning');
  const type=$('#exchangeType')?.value || 'SELL_USD';
  const usd=Number($('#exchangeUsdAmount')?.value||0); if(usd<=0) return showToastV1043('Ingresa el monto en dólares.','warning');
  const valid=validateExchangeCustomerV112(); if(!valid.ok) return showToastV1043(valid.msg,'warning');
  const rate=rateForExchangeTypeV112(type), ref=refRateForExchangeTypeV112(type), nio=Number((usd*rate).toFixed(2));
  const profit=type==='SELL_USD'?Number((usd*(rate-ref)).toFixed(2)):Number((usd*(ref-rate)).toFixed(2));
  const common={cash_session_id:sessionId,operation_type:type,currency_from:type==='SELL_USD'?'NIO':'USD',currency_to:type==='SELL_USD'?'USD':'NIO',amount_usd:usd,rate,amount_nio:nio,reference_rate:ref,profit_nio:profit,customer_name:valid.name,reference:`${valid.doc_type}: ${valid.doc}`,notes:$('#exchangeNotes')?.value||null,status:'COMPLETED',created_at:new Date().toISOString()};
  const extended={...common,customer_document:`${valid.doc_type}: ${valid.doc}`,customer_document_type:valid.doc_type,customer_document_number:valid.doc,customer_phone:valid.phone||null,provider_name:activeExchangeSettingsV112().provider_name,provider_buy_rate:activeExchangeSettingsV112().provider_buy_rate,provider_sell_rate:activeExchangeSettingsV112().provider_sell_rate};
  let r=await sb.from('exchange_operations').insert(extended).select().single();
  if(r.error && /customer_document|customer_document_type|provider_/i.test(r.error.message||'')) r=await sb.from('exchange_operations').insert(common).select().single();
  if(r.error) return showToastV1043('No se pudo registrar Mesa de Cambio: '+r.error.message,'error');
  showToastV1043('Operación registrada. Ya impacta el arqueo C$ y US$.','success');
  $('#exchangeForm')?.reset(); exchangeOperationsV111.unshift(r.data||extended); renderExchangeV111(); updateClosingCashSummaryV84(); renderCash(); renderDashboard();
};
bindExchangeV111=function(){
  if($('#exchangeForm')) $('#exchangeForm').onsubmit=submitExchangeV111;
  ['exchangeType','exchangeUsdAmount','exchangeCashSession'].forEach(id=>{const el=$('#'+id); if(el){el.oninput=exchangePreviewV111; el.onchange=()=>{exchangePreviewV111(); renderExchangeV111();};}});
  const docType=$('#exchangeDocumentType'); if(docType) docType.onchange=documentPlaceholderV112;
  const doc=$('#exchangeDocumentNumber'); if(doc) doc.oninput=formatDocumentV112;
};

(function bootV1003Patch(){
  setTimeout(()=>{buildPaymentUIV1003(); renderPaymentDetails(); patchCashUsdButtonV1003(); if($('#finishSale')) $('#finishSale').onclick=finishSale; if($('#settings')?.classList.contains('show')) renderSettingsV1003();},500);
})();

/* ==========================================================
   V10.03-COMPLETE - Inventario aplicado
   Corrige la edición del producto para que no muestre números sin contexto.
   Convierte el modal/formulario en una ficha profesional con labels permanentes.
   ========================================================== */
function ensureInventoryFormV1003(){
  const form=$('#productForm'); if(!form || form.dataset.v1003Inventory==='1') return;
  form.dataset.v1003Inventory='1';
  form.classList.add('inventory-editor-v1003');
  form.innerHTML=`
    <div class="inventory-editor-head-v1003">
      <div>
        <span class="editor-kicker-v1003">Maestro de Producto</span>
        <h3 id="productEditorTitleV1003">Nuevo producto</h3>
        <p>Ficha completa de inventario, precios, unidades, códigos, proveedor y ubicación.</p>
      </div>
      <div class="editor-status-v1003"><span class="version-pill">V10.03</span><button type="button" id="cancelProductTopV1003" class="ghost">Cerrar</button></div>
    </div>
    <input type="hidden" id="productId">
    <div id="productCodePreviewV1003" class="product-code-preview-v1003 hidden"></div>
    <div class="product-form-sections-v1003">
      <section class="product-form-section-v1003 span-2"><h4>Identificación</h4><div class="formGridV1003">
        <label>Unidad de negocio<select id="productBusinessUnit" required><option value="">Seleccionar unidad</option></select></label>
        <label>Categoría<select id="categorySelect"></select></label>
        <label class="wide">Nombre comercial<input id="productName" required placeholder="Ej. Cemento Canal 42.5 kg"></label>
        <label>Marca<input id="brand" placeholder="Marca"></label>
        <label>Proveedor<input id="supplierName" placeholder="Nombre del proveedor principal"></label>
        <label>Código fabricante<input id="manufacturerCode" placeholder="Código del fabricante"></label>
        <label>Código proveedor<input id="supplierCode" placeholder="Código del proveedor"></label>
        <label class="wide">Alias / nombres comunes<input id="productAlias" placeholder="Cómo lo pide el cliente en mostrador"></label>
      </div></section>
      <section class="product-form-section-v1003"><h4>Tipo de venta y unidad</h4><div class="formGridV1003">
        <label>Tipo de venta<select id="saleType"><option value="UNIDAD">Venta por unidad</option><option value="PESO">Venta por peso</option><option value="LONGITUD">Venta por longitud</option><option value="VOLUMEN">Venta por volumen</option><option value="PAQUETE">Caja / paquete</option><option value="KIT">Kit / juego</option></select></label>
        <label>Unidad de medida<select id="unitType"></select></label>
        <div class="unit-helper" id="unitHelper">UND no permite decimales.</div>
      </div></section>
      <section class="product-form-section-v1003"><h4>Precio e inventario</h4><div class="formGridV1003">
        <label>Costo unitario C$<input id="purchasePrice" type="number" step="0.01" placeholder="0.00"></label>
        <label>Política de margen<select id="profitMargin"><option value="35">Margen 35%</option><option value="40">Margen 40%</option><option value="50">Margen 50%</option><option value="manual">Precio manual</option></select></label>
        <label>Precio de venta C$<input id="salePrice" type="number" step="0.01" placeholder="0.00"></label>
        <label>Stock actual<input id="stock" type="number" step="0.01" placeholder="0"></label>
        <label>Stock mínimo<input id="minStock" type="number" step="0.01" placeholder="0"></label>
        <label>Stock máximo<input id="maxStock" type="number" step="0.01" placeholder="0"></label>
        <label class="wide">Ubicación / pasillo / estante<input id="location" placeholder="Ej. Pasillo 2, Estante B"></label>
      </div></section>
    </div>
    <div class="inventory-editor-summary-v1003">
      <div><small>Costo</small><b id="sumCostV1003">C$ 0</b></div>
      <div><small>Venta</small><b id="sumSaleV1003">C$ 0</b></div>
      <div><small>Margen real</small><b id="sumMarginV1003">0%</b></div>
      <div><small>Stock</small><b id="sumStockV1003">0</b></div>
    </div>
    <div class="formActions sticky-actions-v1003"><button class="primary">Guardar producto</button><button type="button" id="cancelProduct" class="ghost">Cancelar</button></div>`;
  $('#cancelProduct') && ($('#cancelProduct').onclick=resetProductForm);
  $('#cancelProductTopV1003') && ($('#cancelProductTopV1003').onclick=resetProductForm);
  $('#purchasePrice') && ($('#purchasePrice').oninput=()=>{calcSalePrice(); updateInventorySummaryV1003();});
  $('#salePrice') && ($('#salePrice').oninput=updateInventorySummaryV1003);
  $('#stock') && ($('#stock').oninput=updateInventorySummaryV1003);
  $('#profitMargin') && ($('#profitMargin').onchange=()=>{calcSalePrice(); updateInventorySummaryV1003();});
  $('#productForm').onsubmit=saveProduct;
  if(typeof fillBusinessUnitSelectsV102==='function') fillBusinessUnitSelectsV102();
  if(typeof fillCategorySelect==='function') fillCategorySelect();
  if(typeof updateUnitOptionsV102==='function') updateUnitOptionsV102();
}
function updateInventorySummaryV1003(){
  const cost=Number($('#purchasePrice')?.value||0), sale=Number($('#salePrice')?.value||0), stock=Number($('#stock')?.value||0);
  if($('#sumCostV1003')) $('#sumCostV1003').textContent=money(cost);
  if($('#sumSaleV1003')) $('#sumSaleV1003').textContent=money(sale);
  if($('#sumStockV1003')) $('#sumStockV1003').textContent=stock.toLocaleString('es-NI');
  if($('#sumMarginV1003')) $('#sumMarginV1003').textContent=(cost>0?(((sale-cost)/cost)*100).toFixed(1):'0')+'%';
}
const resetProductFormBaseV1003Inventory=resetProductForm;
resetProductForm=function(){
  const form=$('#productForm'); if(form){form.reset(); $('#productId') && ($('#productId').value=''); form.classList.add('hidden');}
};
const editProductBaseV1003Inventory=window.editProduct;
window.editProduct=function(id){
  ensureInventoryFormV1003();
  if(typeof editProductBaseV1003Inventory==='function') editProductBaseV1003Inventory(id);
  const p=(products||[]).find(x=>String(x.id)===String(id));
  if(p){
    $('#productEditorTitleV1003') && ($('#productEditorTitleV1003').textContent='Editar producto');
    $('#productCodePreviewV1003') && ($('#productCodePreviewV1003').classList.remove('hidden'));
    $('#productCodePreviewV1003') && ($('#productCodePreviewV1003').innerHTML=`<div><small>Código interno</small><strong>${escapeHtmlV6(p.internal_code||'SIN-SKU')}</strong></div><div><small>Código de barras</small><strong>${escapeHtmlV6(p.barcode||'Sin código')}</strong></div><div><small>Unidad negocio</small><strong>${escapeHtmlV6(productBusinessUnitObjV104(p).name)}</strong></div>`);
  }
  updateInventorySummaryV1003();
  $('#productForm')?.scrollIntoView({behavior:'smooth',block:'start'});
};
function newProductV1003Inventory(){
  if(!guardAdmin()) return;
  ensureInventoryFormV1003(); resetProductForm(); ensureInventoryFormV1003();
  $('#productEditorTitleV1003') && ($('#productEditorTitleV1003').textContent='Nuevo producto');
  $('#productCodePreviewV1003') && ($('#productCodePreviewV1003').classList.add('hidden'));
  $('#productForm')?.classList.remove('hidden');
  if(typeof fillBusinessUnitSelectsV102==='function') fillBusinessUnitSelectsV102();
  if(typeof fillCategorySelect==='function') fillCategorySelect();
  if(typeof updateUnitOptionsV102==='function') updateUnitOptionsV102();
  updateInventorySummaryV1003();
  $('#productForm')?.scrollIntoView({behavior:'smooth',block:'start'});
}
const showViewBaseV1003Inventory=showView;
showView=function(id,btn){
  showViewBaseV1003Inventory(id,btn);
  if(id==='products'){
    ensureInventoryFormV1003();
    if($('#newProductBtn')) $('#newProductBtn').onclick=newProductV1003Inventory;
  }
};
setTimeout(()=>{try{ensureInventoryFormV1003(); if($('#newProductBtn')) $('#newProductBtn').onclick=newProductV1003Inventory;}catch(e){console.warn('Inventario V10.03',e);}},700);


/* =========================================================
   V10.03 MOBILE READY — navegación y tablas adaptables
========================================================= */
(function initMobileReadyV1003(){
  const body=document.body;
  const menuBtn=document.getElementById('mobileMenuBtn');
  const backdrop=document.getElementById('mobileNavBackdrop');
  const sidebar=document.getElementById('appSidebar') || document.querySelector('.sidebar');

  const closeMobileNav=()=>{
    body.classList.remove('mobile-nav-open');
    menuBtn?.setAttribute('aria-expanded','false');
    backdrop?.setAttribute('aria-hidden','true');
  };
  const toggleMobileNav=()=>{
    const open=!body.classList.contains('mobile-nav-open');
    body.classList.toggle('mobile-nav-open',open);
    menuBtn?.setAttribute('aria-expanded',String(open));
    backdrop?.setAttribute('aria-hidden',String(!open));
  };

  menuBtn?.addEventListener('click',toggleMobileNav);
  backdrop?.addEventListener('click',closeMobileNav);
  sidebar?.querySelectorAll('nav button[data-view]').forEach(btn=>btn.addEventListener('click',closeMobileNav));
  document.addEventListener('keydown',event=>{if(event.key==='Escape') closeMobileNav();});
  window.addEventListener('resize',()=>{if(window.innerWidth>1100) closeMobileNav();});

  function wrapWideTables(root=document){
    root.querySelectorAll('table').forEach(table=>{
      const parent=table.parentElement;
      if(!parent || parent.classList.contains('mobile-table-shell') || parent.classList.contains('table-scroll') || parent.classList.contains('users-table-wrap') || parent.classList.contains('label-table-wrap')) return;
      const shell=document.createElement('div');
      shell.className='mobile-table-shell';
      parent.insertBefore(shell,table);
      shell.appendChild(table);
    });
  }
  wrapWideTables();
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType!==1) continue;
        if(node.matches?.('table')) wrapWideTables(node.parentElement || document);
        else if(node.querySelector?.('table')) wrapWideTables(node);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();

/* ==========================================================
   V12.13 — Impresión térmica + margen personalizado
   - Tickets 58/80 mm en ventana limpia, con prueba de impresión.
   - Margen editable: 35, 40, 50, personalizado o precio manual.
========================================================== */
const MM_PRINT_SETTINGS_V1213_KEY='mm_print_settings_v1213';
function getPrintSettingsV1213(){
  try{return {...{width:'80',autoCut:true},...JSON.parse(localStorage.getItem(MM_PRINT_SETTINGS_V1213_KEY)||'{}')}}catch(_){return {width:'80',autoCut:true}}
}
function savePrintSettingsV1213(){
  const width=document.querySelector('#thermalWidthV1213')?.value||'80';
  const autoCut=Boolean(document.querySelector('#thermalCutV1213')?.checked);
  localStorage.setItem(MM_PRINT_SETTINGS_V1213_KEY,JSON.stringify({width,autoCut}));
  if(typeof showToastV1043==='function') showToastV1043('Configuración de impresión guardada.');
}
function thermalDocumentV1213(content,title='Ticket MM Comercial'){
  const cfg=getPrintSettingsV1213();
  const widthMm=cfg.width==='58'?58:80;
  const printableMm=cfg.width==='58'?54:76;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style id="pageSizeV1213">
    @page{size:${widthMm}mm auto;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0!important;padding:0!important;width:${widthMm}mm!important;min-width:${widthMm}mm!important;max-width:${widthMm}mm!important;background:#fff!important;color:#000!important;overflow:visible!important}
    body{font-family:Arial,Helvetica,sans-serif;font-size:${cfg.width==='58'?'12px':'14px'};font-weight:500;line-height:1.32;writing-mode:horizontal-tb!important}
    .ticket{display:block;width:${printableMm}mm!important;max-width:${printableMm}mm!important;margin:0 auto!important;padding:2mm 0 ${cfg.autoCut?'2mm':'1mm'}!important;overflow:visible!important}
    h3{font-size:${cfg.width==='58'?'17px':'20px'};line-height:1.15;margin:0 0 4px;font-weight:900}.center{text-align:center}.ticketRow{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin:2px 0}.ticketRow span:first-child,.ticketRow b:first-child{min-width:0;overflow-wrap:anywhere}.ticketRow span:last-child,.ticketRow b:last-child{text-align:right;white-space:nowrap;font-weight:700}
    .ticket>div>b{display:block;font-size:${cfg.width==='58'?'12px':'14px'};line-height:1.25;margin-top:4px;overflow-wrap:anywhere}b{font-weight:800}
    hr{border:0;border-top:1px dashed #000;margin:6px 0}.print-note{height:2mm;margin:0;font-size:1px;color:#fff}
    @media print{html,body{width:${widthMm}mm!important;height:auto!important}.ticket{page-break-after:avoid!important;break-after:avoid-page!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div id="thermalTicketV1213" class="ticket">${content}${cfg.autoCut?'<div class="print-note">.</div>':''}</div><script>
  window.onload=()=>{
    setTimeout(()=>{
      const ticket=document.getElementById('thermalTicketV1213');
      const px=ticket.getBoundingClientRect().height;
      const contentMm=Math.ceil(px*25.4/96);
      const heightMm=Math.max(widthMm+1,contentMm+1);
      document.getElementById('pageSizeV1213').textContent += '@page{size:${widthMm}mm '+heightMm+'mm!important;margin:0!important}';
      document.documentElement.style.height=heightMm+'mm';
      document.body.style.height=heightMm+'mm';
      window.focus();
      window.print();
      setTimeout(()=>window.close(),700);
    },300);
  };
  window.onafterprint=()=>setTimeout(()=>window.close(),150);
  <\/script></body></html>`;
}
function printThermalHtmlV1213(content,title){
  const popup=window.open('','MM_TICKET_PRINT','width=420,height=720');
  if(!popup){alert('El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para este sitio.');return}
  popup.document.open(); popup.document.write(thermalDocumentV1213(content,title)); popup.document.close();
}
window.printTicket=function(){
  const ticket=document.querySelector('#ticket80');
  if(!ticket)return;
  printThermalHtmlV1213(ticket.innerHTML,'Factura MM Comercial');
};
window.printTestTicketV1213=function(){
  const cfg=getPrintSettingsV1213();
  const sample=`<h3 class="center">MM FERRETERÍA</h3><div class="center">TICKET DE PRUEBA<br>${cfg.width} mm</div><hr><div class="ticketRow"><span>Producto de prueba</span><span>C$ 10.00</span></div><hr><div class="ticketRow"><b>TOTAL</b><b>C$ 10.00</b></div><hr><div class="center">Impresora configurada correctamente<br>${new Date().toLocaleString('es-NI')}</div>`;
  printThermalHtmlV1213(sample,'Prueba impresora térmica');
};
function enhancePrinterSettingsV1213(){
  const settings=document.querySelector('#settings .panel');
  if(!settings || settings.querySelector('#printerSettingsV1213'))return;
  const cfg=getPrintSettingsV1213();
  settings.insertAdjacentHTML('beforeend',`<div id="printerSettingsV1213" class="printer-settings-v1213"><div><h4>Impresora térmica</h4><p>Formato vertical, letra legible y corte ajustado al final del contenido. Esta configuración se utiliza en ventas nuevas y reimpresiones.</p></div><div class="printer-grid-v1213"><label>Ancho del papel<select id="thermalWidthV1213"><option value="80" ${cfg.width==='80'?'selected':''}>80 mm — 3nStar RPT004</option><option value="58" ${cfg.width==='58'?'selected':''}>58 mm</option></select></label><label class="check-v1213"><input id="thermalCutV1213" type="checkbox" ${cfg.autoCut?'checked':''}> Espacio mínimo para corte automático</label></div><div class="toolbar"><button type="button" class="primary" onclick="savePrintSettingsV1213()">Guardar impresión</button><button type="button" class="ghost" onclick="printTestTicketV1213()">Imprimir prueba</button></div></div>`);
}
window.savePrintSettingsV1213=savePrintSettingsV1213;

function ensureCustomMarginV1213(){
  const select=document.querySelector('#profitMargin');
  if(!select)return;
  if(!select.querySelector('option[value="custom"]')){
    const manual=select.querySelector('option[value="manual"]');
    const opt=document.createElement('option'); opt.value='custom'; opt.textContent='Otro porcentaje';
    select.insertBefore(opt,manual||null);
  }
  let field=document.querySelector('#customMarginV1213');
  if(!field){
    field=document.createElement('input'); field.id='customMarginV1213'; field.type='number'; field.min='0'; field.step='0.01'; field.placeholder='Escribí el %'; field.className='hidden';
    select.insertAdjacentElement('afterend',field);
  }
  const sync=()=>{
    const mode=select.value;
    field.classList.toggle('hidden',mode!=='custom');
    const sale=document.querySelector('#salePrice');
    if(sale){sale.readOnly=mode!=='manual'; sale.classList.toggle('manual-price-v1213',mode==='manual');}
    calcSalePriceV1213();
  };
  select.onchange=sync;
  field.oninput=()=>{calcSalePriceV1213(); if(typeof updateInventorySummaryV1003==='function')updateInventorySummaryV1003();};
  document.querySelector('#purchasePrice')?.addEventListener('input',()=>{calcSalePriceV1213(); if(typeof updateInventorySummaryV1003==='function')updateInventorySummaryV1003();});
  document.querySelector('#salePrice')?.addEventListener('input',()=>{if(select.value==='manual'&&typeof updateInventorySummaryV1003==='function')updateInventorySummaryV1003();});
  sync();
}
function selectedMarginV1213(){
  const mode=document.querySelector('#profitMargin')?.value||'35';
  if(mode==='manual')return null;
  if(mode==='custom')return Math.max(0,Number(document.querySelector('#customMarginV1213')?.value||0));
  return Math.max(0,Number(mode||35));
}
function calcSalePriceV1213(){
  const select=document.querySelector('#profitMargin'), saleEl=document.querySelector('#salePrice');
  if(!select||!saleEl||select.value==='manual')return;
  const cost=Math.max(0,Number(document.querySelector('#purchasePrice')?.value||0));
  const margin=selectedMarginV1213()||0;
  saleEl.value=(cost*(1+margin/100)).toFixed(2);
}
calcSalePrice=calcSalePriceV1213;

const saveProductBaseV1213=saveProduct;
saveProduct=async function(e){
  e.preventDefault(); if(!guardAdmin())return;
  const select=document.querySelector('#profitMargin');
  if(!select)return saveProductBaseV1213(e);
  const mode=select.value, manual=mode==='manual', margin=manual?0:selectedMarginV1213();
  const cost=Math.max(0,Number(document.querySelector('#purchasePrice')?.value||0));
  const sale=manual?Number(document.querySelector('#salePrice')?.value||0):Number((cost*(1+margin/100)).toFixed(2));
  if(manual && sale<=0){alert('Ingresá un precio manual mayor que cero.');return}
  const categoryId=document.querySelector('#categorySelect')?.value||null;
  const payload={supplier_code:document.querySelector('#supplierCode')?.value||null,name:document.querySelector('#productName')?.value,category_id:categoryId,brand:document.querySelector('#brand')?.value||null,unit_type:document.querySelector('#unitType')?.value||'UND',purchase_price:cost,profit_margin:margin,allow_manual_price:manual,sale_price:sale,public_price:sale,stock:Number(document.querySelector('#stock')?.value||0),min_stock:Number(document.querySelector('#minStock')?.value||0),max_stock:Number(document.querySelector('#maxStock')?.value||0),location:document.querySelector('#location')?.value||null,last_cost_update:new Date().toISOString(),business_unit_id:document.querySelector('#productBusinessUnit')?.value||null,sale_type:document.querySelector('#saleType')?.value||'UNIDAD',allows_decimal:typeof isDecimalUnitV102==='function'?isDecimalUnitV102(document.querySelector('#unitType')?.value):false,manufacturer_code:document.querySelector('#manufacturerCode')?.value||null,aliases:document.querySelector('#productAlias')?.value||null};
  let r; const id=document.querySelector('#productId')?.value;
  if(id)r=await sb.from('products').update(payload).eq('id',id);
  else{const code=typeof generateProductCodeV106==='function'?await generateProductCodeV106(categoryId):('MM-GEN-'+Date.now());r=await sb.from('products').insert({...payload,internal_code:code,barcode:code,status:'ACTIVE'});}
  if(r.error){alert(r.error.message);return}
  resetProductForm(); await loadAll();
};

const editProductBaseV1213=window.editProduct;
window.editProduct=function(id){
  if(typeof editProductBaseV1213==='function')editProductBaseV1213(id);
  setTimeout(()=>{
    ensureCustomMarginV1213();
    const p=(products||[]).find(x=>String(x.id)===String(id)); if(!p)return;
    const select=document.querySelector('#profitMargin'), custom=document.querySelector('#customMarginV1213');
    const margin=Number(p.profit_margin||0);
    if(p.allow_manual_price)select.value='manual';
    else if([35,40,50].includes(margin))select.value=String(margin);
    else{select.value='custom';custom.value=String(margin);}
    select.dispatchEvent(new Event('change'));
    document.querySelector('#salePrice').value=Number(p.sale_price||0).toFixed(2);
    if(typeof updateInventorySummaryV1003==='function')updateInventorySummaryV1003();
  },80);
};

const showViewBaseV1213=showView;
showView=function(id,btn){
  showViewBaseV1213(id,btn);
  if(id==='settings')setTimeout(enhancePrinterSettingsV1213,30);
  if(id==='products')setTimeout(ensureCustomMarginV1213,60);
};
(function bootV1213(){
  document.title='MM Comercial ERP V12.13';
  const pill=document.querySelector('.version-pill'); if(pill)pill.textContent='V12.13';
  const brand=document.querySelector('.brand span'); if(brand)brand.textContent='V12.13';
  const printBtn=document.querySelector('#ticketModal .modalActions .primary'); if(printBtn)printBtn.textContent='Imprimir ticket';
  const actions=document.querySelector('#ticketModal .modalActions');
  if(actions && !actions.querySelector('[data-test-ticket]'))actions.insertAdjacentHTML('afterbegin','<button type="button" data-test-ticket class="ghost" onclick="printTestTicketV1213()">Imprimir prueba</button>');
  setTimeout(()=>{enhancePrinterSettingsV1213();ensureCustomMarginV1213();},500);
})();


/* ============================================================
   MM Comercial V12.14 - Clientes en factura y reimpresión
   ============================================================ */
function customerNameForSaleV1214(sale){
  if(sale?.customer_name) return sale.customer_name;
  const c=clients.find(x=>String(x.id)===String(sale?.customer_id));
  return c?.name||'Cliente eventual';
}
function customerPhoneForSaleV1214(sale){
  if(sale?.customer_phone) return sale.customer_phone;
  const c=clients.find(x=>String(x.id)===String(sale?.customer_id));
  return c?.phone||'';
}
window.reprintSaleV1214=function(saleId,printNow=false){
  const sale=sales.find(x=>String(x.id)===String(saleId));
  if(!sale) return showToastV1043?.('No se encontró la venta.','error');
  const items=saleItems.filter(x=>String(x.sale_id)===String(saleId));
  if(!items.length) return showToastV1043?.('La factura no tiene productos cargados.','warning');
  lastSale={...sale,items,customer_name:customerNameForSaleV1214(sale),customer_phone:customerPhoneForSaleV1214(sale)};
  renderTicket(lastSale);
  $('#ticketModal')?.classList.remove('hidden');
  if(printNow) setTimeout(()=>window.printTicket(),180);
};
window.viewSaleV1214=function(saleId){window.reprintSaleV1214(saleId,false)};

renderSales=function(){
  const q=($('#salesSearchV1214')?.value||'').trim().toLowerCase();
  const list=sales.filter(s=>{
    const customer=customerNameForSaleV1214(s);
    return [s.invoice_no,customer,s.payment_method,s.status].join(' ').toLowerCase().includes(q);
  });
  const table=$('#salesTable'); if(!table)return;
  table.innerHTML='<tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Método</th><th>Total</th><th>Estado</th><th>Acciones</th></tr>'+list.map(s=>`<tr><td><b>${s.invoice_no||''}</b></td><td>${new Date(s.created_at).toLocaleString('es-NI')}</td><td>${customerNameForSaleV1214(s)}</td><td>${s.payment_method||''}</td><td>${money(s.total)}</td><td><span class="tag">${s.status||'COMPLETED'}</span></td><td><div class="sales-actions-v1214"><button type="button" class="ghost" onclick="viewSaleV1214('${s.id}')">Ver</button><button type="button" class="primary" onclick="reprintSaleV1214('${s.id}',true)">Reimprimir</button></div></td></tr>`).join('');
};

function enhanceSalesViewV1214(){
  const section=$('#sales'); if(!section)return;
  const panel=section.querySelector('.panel'); if(!panel)return;
  if(!$('#salesSearchV1214')){
    const h=panel.querySelector('h3');
    h?.insertAdjacentHTML('afterend','<div class="sales-toolbar-v1214"><input id="salesSearchV1214" placeholder="Buscar factura, cliente o método de pago"><span>Las facturas pueden abrirse y reimprimirse cuando sea necesario.</span></div>');
    $('#salesSearchV1214').oninput=renderSales;
  }
  renderSales();
}

// Selección clara del cliente en el POS y nombre libre en el comprobante.
const selectClientBySearchBaseV1214=selectClientBySearch;
selectClientBySearch=function(){
  selectClientBySearchBaseV1214();
  const typed=($('#customerSearch')?.value||'').trim();
  const chip=$('#selectedCustomer');
  if(!selectedCustomer && typed && chip) chip.textContent=`Factura a nombre de: ${typed}`;
};
if($('#customerSearch')) $('#customerSearch').oninput=selectClientBySearch;

const showViewBaseV1214=showView;
showView=function(id,btn){
  showViewBaseV1214(id,btn);
  if(id==='sales') enhanceSalesViewV1214();
};

const loadAllBaseV1214=loadAll;
loadAll=async function(){
  await loadAllBaseV1214();
  if(document.querySelector('#sales.active') || !$('#sales')?.classList.contains('hidden')) enhanceSalesViewV1214();
};

/* =========================================================
   V12.16 - Impresión térmica vertical y legible
   ========================================================= */
function selectedDashboardUnitV1215(){
  return typeof selectedUnitCodeV104==='function' ? String(selectedUnitCodeV104()).toUpperCase() : 'ALL';
}
function localDateNicaraguaV1215(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime())) return String(value||'').slice(0,10);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Managua',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function itemUnitCodeV1215(item){
  if(item.business_unit_code) return String(item.business_unit_code).toUpperCase();
  if(item.business_unit_id){
    const unit=typeof businessUnitByAnyV107==='function' ? businessUnitByAnyV107(item.business_unit_id) : null;
    if(unit?.code) return String(unit.code).toUpperCase();
  }
  const product=(products||[]).find(p=>String(p.id)===String(item.product_id));
  return product && typeof productBusinessUnitCodeV104==='function' ? String(productBusinessUnitCodeV104(product)).toUpperCase() : 'FER';
}
function saleMetricsForUnitV1215(unitCode,day){
  const validSales=(sales||[]).filter(s=>String(s.status||'COMPLETED').toUpperCase()!=='CANCELLED' && (!day||localDateNicaraguaV1215(s.created_at)===day));
  let revenue=0, profit=0;
  validSales.forEach(sale=>{
    const items=(saleItems||[]).filter(i=>String(i.sale_id)===String(sale.id));
    if(unitCode==='ALL'){
      revenue+=Number(sale.total||items.reduce((a,i)=>a+Number(i.total||0),0));
      profit+=Number(sale.profit_total||items.reduce((a,i)=>a+Number(i.profit_amount||0),0));
      return;
    }
    const gross=items.reduce((a,i)=>a+Number(i.total||0),0);
    const selected=items.filter(i=>itemUnitCodeV1215(i)===unitCode);
    const selectedGross=selected.reduce((a,i)=>a+Number(i.total||0),0);
    const share=gross>0?selectedGross/gross:0;
    const allocatedDiscount=Number(sale.discount||0)*share;
    revenue+=Math.max(0,selectedGross-allocatedDiscount);
    profit+=selected.reduce((a,i)=>a+Number(i.profit_amount||0),0)-allocatedDiscount;
  });
  return {revenue,profit};
}
function dashboardSalesForUnitV1215(unitCode){
  return (sales||[]).map(s=>{
    if(unitCode==='ALL') return {...s,unit_total:Number(s.total||0)};
    const items=(saleItems||[]).filter(i=>String(i.sale_id)===String(s.id));
    const gross=items.reduce((a,i)=>a+Number(i.total||0),0);
    const selectedGross=items.filter(i=>itemUnitCodeV1215(i)===unitCode).reduce((a,i)=>a+Number(i.total||0),0);
    return {...s,unit_total:Math.max(0,selectedGross-(gross>0?Number(s.discount||0)*(selectedGross/gross):0))};
  }).filter(s=>s.unit_total>0);
}
const renderDashboardBaseV1215=renderDashboard;
renderDashboard=function(){
  renderDashboardBaseV1215();
  const unit=selectedDashboardUnitV1215();
  const metrics=saleMetricsForUnitV1215(unit,localDateNicaraguaV1215());
  if($('#kpiToday')) $('#kpiToday').textContent=money(metrics.revenue);
  if($('#kpiProfitToday')) $('#kpiProfitToday').textContent=money(metrics.profit);
  if($('#kpiProfitScope')) $('#kpiProfitScope').textContent=unit==='FER'?'Solo ventas de Ferretería':unit==='LIB'?'Solo ventas de Librería':'Ferretería + Librería';
  const visibleProducts=(products||[]).filter(p=>unit==='ALL'||String(productBusinessUnitCodeV104(p)).toUpperCase()===unit);
  if($('#kpiLowStock')) $('#kpiLowStock').textContent=visibleProducts.filter(p=>Number(p.stock)<=Number(p.min_stock)).length;
  const map={};
  dashboardSalesForUnitV1215(unit).forEach(s=>{const key=s.customer_id||'eventual';map[key]=(map[key]||0)+s.unit_total;});
  const rows=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if($('#dashTopClients')) $('#dashTopClients').innerHTML='<tr><th>Cliente</th><th>Total</th></tr>'+rows.map(([id,total])=>`<tr><td>${id==='eventual'?'Cliente eventual':escapeHtmlV6(clients.find(c=>c.id===id)?.name||id)}</td><td>${money(total)}</td></tr>`).join('');
};

function restoreSupplierNameV1215(product){
  const field=$('#supplierName'); if(field) field.value=product?.supplier_name||'';
}
const editProductBaseV1215=window.editProduct;
window.editProduct=function(id){
  editProductBaseV1215(id);
  restoreSupplierNameV1215((products||[]).find(p=>String(p.id)===String(id)));
};
const resetProductFormBaseV1215=resetProductForm;
resetProductForm=function(){resetProductFormBaseV1215();restoreSupplierNameV1215(null);};
const saveProductBaseV1215=saveProduct;
saveProduct=async function(e){
  e.preventDefault();
  const form=$('#productForm');
  const supplierName=($('#supplierName')?.value||'').trim()||null;
  const id=$('#productId')?.value;
  /* La rutina existente conserva todas sus validaciones. Guardamos el proveedor
     después, únicamente si el producto pudo crearse o actualizarse. */
  const beforeIds=new Set((products||[]).map(p=>String(p.id)));
  await saveProductBaseV1215({preventDefault(){}});
  if(id){
    const r=await sb.from('products').update({supplier_name:supplierName}).eq('id',id);
    if(r.error) return alert('No se pudo guardar el proveedor: '+r.error.message);
  }else{
    await loadAll();
    const created=(products||[]).find(p=>!beforeIds.has(String(p.id)));
    if(created){const r=await sb.from('products').update({supplier_name:supplierName}).eq('id',created.id);if(r.error)return alert('No se pudo guardar el proveedor: '+r.error.message);}
  }
  await loadAll();
};
if($('#productForm')) $('#productForm').onsubmit=saveProduct;

const inventoryCardBaseV1215=inventoryCardV105;
inventoryCardV105=function(p){
  const html=inventoryCardBaseV1215(p);
  const supplier=p.supplier_name ? ` · Proveedor: ${escapeHtmlV6(p.supplier_name)}` : '';
  return html.replace(' · Ref:',`${supplier} · Ref:`);
};

function bindInventoryCategoryV1215(){
  const filter=$('#inventoryCategoryFilter');
  if(filter) filter.onchange=()=>{selectedInventoryProductV93=null;renderProducts();};
}
setTimeout(bindInventoryCategoryV1215,100);

/* Impresión exacta: una página física por etiqueta, sin longitud de factura. */
printLabelsV107=function(){
  const p=selectedLabelProductV91(), preview=$('#labelPreview');
  if(!p||!preview||preview.innerHTML.includes('label-empty')) return showToastV1043('Seleccioná un producto para imprimir etiqueta.','warning');
  const qty=Math.max(1,Math.min(200,Number($('#labelQty')?.value||1)));
  const format=$('#labelFormat')?.value||'thermal_50x30';
  const size=format==='shelf_70x40'?{w:70,h:40,cls:'label-70x40'}:format==='sheet_a4'?{w:210,h:297,cls:'sheet-a4-label'}:{w:50,h:30,cls:'label-50x30'};
  const one=preview.querySelector('.thermal-label')?.outerHTML||preview.innerHTML;
  const pages=Array.from({length:qty},()=>`<div class="label-page">${one}</div>`).join('');
  const css=`@page{size:${size.w}mm ${size.h}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif}.label-page{width:${size.w}mm;height:${size.h}mm;overflow:hidden;break-after:page;page-break-after:always}.label-page:last-child{break-after:auto;page-break-after:auto}.thermal-label{width:${size.w}mm!important;height:${size.h}mm!important;margin:0!important;border:0!important;box-shadow:none!important;overflow:hidden;background:#fff!important;color:#111!important;display:grid!important;grid-template-rows:auto 1fr auto!important;align-items:center!important;padding:${size.w===70?'4mm':'2.5mm 3mm'}!important}.label-name{text-align:center;font-size:${size.w===70?'12px':'10.5px'};font-weight:900;text-transform:uppercase;overflow:hidden}.barcode-svg{display:block;width:100%;height:${size.w===70?'14mm':'11mm'}}.label-footer{display:grid;grid-template-columns:1fr auto;gap:2mm;align-items:end}.label-price{font-size:${size.w===70?'17px':'13px'};font-weight:900;color:#000}.label-sku{font-size:8px;color:#111}@media print{html,body{width:${size.w}mm;height:${size.h}mm;overflow:hidden}}`;
  const win=window.open('','mm_label_print','width=420,height=360');
  if(!win)return showToastV1043('El navegador bloqueó la ventana de impresión. Permití ventanas emergentes.','error');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta MM Comercial</title><style>${css}</style></head><body>${pages}</body></html>`);win.document.close();
  if(typeof saveLabelPrintLogV91==='function')saveLabelPrintLogV91(p.id,qty);
  setTimeout(()=>{win.focus();win.print();},300);win.onafterprint=()=>setTimeout(()=>win.close(),150);
};
printLabelsV9=printLabelsV107;
if($('#printLabels'))$('#printLabels').onclick=printLabelsV107;
if($('#printSelectedLabels'))$('#printSelectedLabels').onclick=printLabelsV107;

function applyVersionV1215(){
  if(document.querySelector('title')) document.querySelector('title').textContent='MYM Comercial ERP V12.16';
  if(document.querySelector('.brand span')) document.querySelector('.brand span').textContent='V12.16';
  document.querySelectorAll('.version-pill').forEach(pill=>pill.textContent='V12.16');
}
setTimeout(applyVersionV1215,900);

/* =========================================================
   V12.17 - Historial de ventas por fecha y unidad
   ========================================================= */
function saleUnitTotalsV1217(sale,unitCode){
  const items=(saleItems||[]).filter(i=>String(i.sale_id)===String(sale.id));
  if(unitCode==='ALL') return {total:Number(sale.total||0),profit:Number(sale.profit_total||0)};
  const gross=items.reduce((sum,item)=>sum+Number(item.total||0),0);
  const selected=items.filter(item=>itemUnitCodeV1215(item)===unitCode);
  const selectedGross=selected.reduce((sum,item)=>sum+Number(item.total||0),0);
  const share=gross>0?selectedGross/gross:0;
  const discount=Number(sale.discount||0)*share;
  return {
    total:Math.max(0,selectedGross-discount),
    profit:selected.reduce((sum,item)=>sum+Number(item.profit_amount||0),0)-discount
  };
}
function salesDateValueV1217(id){return document.querySelector(id)?.value||''}
window.salesTodayV1217=function(){
  const today=localDateNicaraguaV1215();
  if($('#salesDateFromV1217')) $('#salesDateFromV1217').value=today;
  if($('#salesDateToV1217')) $('#salesDateToV1217').value=today;
  renderSales();
};
window.clearSalesDatesV1217=function(){
  if($('#salesDateFromV1217')) $('#salesDateFromV1217').value='';
  if($('#salesDateToV1217')) $('#salesDateToV1217').value='';
  renderSales();
};
function salesScopeLabelV1217(unit){return unit==='FER'?'Ferretería':unit==='LIB'?'Librería':'Todas las unidades'}
renderSales=function(){
  const table=$('#salesTable'); if(!table)return;
  const q=($('#salesSearchV1214')?.value||'').trim().toLowerCase();
  let from=salesDateValueV1217('#salesDateFromV1217');
  let to=salesDateValueV1217('#salesDateToV1217');
  if(from&&to&&from>to){const swap=from;from=to;to=swap;}
  const unit=selectedDashboardUnitV1215();
  const list=(sales||[]).map(s=>({...s,_unit:saleUnitTotalsV1217(s,unit)})).filter(s=>{
    const day=localDateNicaraguaV1215(s.created_at);
    const customer=customerNameForSaleV1214(s);
    const matchesText=[s.invoice_no,customer,s.payment_method,s.status].join(' ').toLowerCase().includes(q);
    const matchesDate=(!from||day>=from)&&(!to||day<=to);
    const matchesUnit=unit==='ALL'||s._unit.total>0;
    return matchesText&&matchesDate&&matchesUnit;
  }).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  const completed=list.filter(s=>String(s.status||'COMPLETED').toUpperCase()!=='CANCELLED');
  const total=completed.reduce((sum,s)=>sum+s._unit.total,0);
  const profit=completed.reduce((sum,s)=>sum+s._unit.profit,0);
  const summary=$('#salesSummaryV1217');
  if(summary) summary.innerHTML=`<div><small>PERÍODO</small><b>${from||to?(from||'Inicio')+' — '+(to||'Hoy'):'Todas las fechas'}</b></div><div><small>UNIDAD</small><b>${salesScopeLabelV1217(unit)}</b></div><div><small>VENTAS</small><b>${completed.length}</b></div><div><small>TOTAL VENDIDO</small><b>${money(total)}</b></div><div><small>GANANCIA</small><b>${money(profit)}</b></div>`;
  const header='<tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Método</th><th>Total</th><th>Estado</th><th>Acciones</th></tr>';
  const rows=list.map(s=>`<tr><td><b>${escapeHtmlV6(s.invoice_no||'')}</b></td><td>${new Date(s.created_at).toLocaleString('es-NI',{timeZone:'America/Managua'})}</td><td>${escapeHtmlV6(customerNameForSaleV1214(s))}</td><td>${escapeHtmlV6(s.payment_method||'')}</td><td>${money(s._unit.total)}</td><td><span class="tag">${escapeHtmlV6(s.status||'COMPLETED')}</span></td><td><div class="sales-actions-v1214"><button type="button" class="ghost" onclick="viewSaleV1214('${s.id}')">Ver</button><button type="button" class="primary" onclick="reprintSaleV1214('${s.id}',true)">Reimprimir</button></div></td></tr>`).join('');
  table.innerHTML=header+(rows||'<tr><td colspan="7" class="sales-empty-v1217">No hay ventas para los filtros seleccionados.</td></tr>');
};
function enhanceSalesDatesV1217(){
  const panel=$('#sales .panel'); if(!panel)return;
  if(!$('#salesSearchV1214')){
    const h=panel.querySelector('h3');
    h?.insertAdjacentHTML('afterend','<div class="sales-toolbar-v1214"><input id="salesSearchV1214" placeholder="Buscar factura, cliente o método de pago"></div>');
    $('#salesSearchV1214').oninput=renderSales;
  }
  if(!$('#salesDatesV1217')){
    const toolbar=$('#salesSearchV1214')?.closest('.sales-toolbar-v1214');
    toolbar?.insertAdjacentHTML('afterend','<div id="salesDatesV1217" class="sales-dates-v1217"><label>Desde<input type="date" id="salesDateFromV1217"></label><label>Hasta<input type="date" id="salesDateToV1217"></label><button type="button" class="ghost" onclick="salesTodayV1217()">Hoy</button><button type="button" class="ghost" onclick="clearSalesDatesV1217()">Todas las fechas</button></div><div id="salesSummaryV1217" class="sales-summary-v1217"></div>');
    $('#salesDateFromV1217').onchange=renderSales;
    $('#salesDateToV1217').onchange=renderSales;
  }
  renderSales();
}
const showViewBaseV1217=showView;
showView=function(id,btn){
  showViewBaseV1217(id,btn);
  if(id==='sales') setTimeout(enhanceSalesDatesV1217,30);
};
const setBusinessFilterBaseV1217=typeof setBusinessFilterV104==='function'?setBusinessFilterV104:null;
if(setBusinessFilterBaseV1217){
  setBusinessFilterV104=function(code){
    const result=setBusinessFilterBaseV1217(code);
    if($('#sales')?.classList.contains('show')) setTimeout(renderSales,30);
    return result;
  };
  window.setBusinessFilterV104=setBusinessFilterV104;
  window.setBusinessFilterV102=setBusinessFilterV104;
}
function applyVersionV1217(){
  if(document.querySelector('title')) document.querySelector('title').textContent='MYM Comercial ERP V12.17';
  if(document.querySelector('.brand span')) document.querySelector('.brand span').textContent='V12.17';
  document.querySelectorAll('.version-pill').forEach(pill=>pill.textContent='V12.17');
}
setTimeout(applyVersionV1217,1000);
