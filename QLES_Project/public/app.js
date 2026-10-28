const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { user: null, doctors: [], hospitals: [], bookings: [], pollTimer: null, page: 'home' };
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const escapeHtml = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = name => String(name || 'Dr').replace(/^Dr\.?\s*/i,'').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const statusClass = s => `status-${String(s).replace(/\s+/g,'-')}`;
const avatarClass = id => ['','purple','orange','blue','rose','gold'][Number(id)%6];
async function api(url, options={}) {
  const res = await fetch(url, { credentials:'same-origin', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function toast(message, error=false) {
  const el=document.createElement('div'); el.className='toast'+(error?' error':''); el.textContent=message;
  $('#toast-root').append(el); setTimeout(()=>el.remove(),3600);
}
function renderNav() {
  const actions=$('#nav-actions');
  actions.innerHTML = state.user
    ? `<span class="nav-user">Hi, ${escapeHtml(state.user.name.split(' ')[0])}</span><button class="btn btn-quiet" data-action="logout">Log out</button>`
    : `<button class="btn btn-quiet" data-action="open-login">Log in</button><button class="btn btn-primary" data-action="open-register">Create account <span>↗</span></button>`;
  $$('.auth-only').forEach(el=>el.classList.toggle('hidden',!state.user || state.user.role!=='patient'));
  $$('.admin-only').forEach(el=>el.classList.toggle('hidden',!state.user || state.user.role!=='admin'));
}
async function loadInitial() {
  try {
    const [session,hospitals,doctors]=await Promise.all([api('/api/session'),api('/api/hospitals'),api('/api/doctors')]);
    state.user=session.user; state.hospitals=hospitals; state.doctors=doctors;
    renderNav(); fillFilters(); renderDoctors();
    $('#hospital-count').textContent=hospitals.length; $('#doctor-count').textContent=doctors.length;
  } catch(e) { toast(e.message,true); }
  if(state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer=setInterval(refreshLive,8000);
}
async function refreshLive() {
  try {
    state.doctors=await api('/api/doctors');
    if(state.page==='home') renderDoctors();
    if(state.page==='bookings') await renderBookings(false);
    if(state.page==='admin') await renderAdmin(false);
  } catch(e) { /* Keep the current view if a refresh temporarily fails. */ }
}
function fillFilters() {
  const specs=[...new Set(state.doctors.map(d=>d.specialty))].sort();
  $('#specialty-filter').innerHTML='<option value="">All specialties</option>'+specs.map(s=>`<option>${escapeHtml(s)}</option>`).join('');
  $('#hospital-filter').innerHTML='<option value="">All hospitals</option>'+state.hospitals.map(h=>`<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');
}
function renderDoctors() {
  const q=$('#directory-search').value.trim().toLowerCase();
  const spec=$('#specialty-filter').value, status=$('#status-filter').value, hosp=$('#hospital-filter').value;
  const docs=state.doctors.filter(d=>(!q||[d.name,d.hospital_name,d.hospital_city,d.specialty].some(x=>String(x).toLowerCase().includes(q)))&&(!spec||d.specialty===spec)&&(!status||d.status===status)&&(!hosp||String(d.hospital_id)===hosp));
  $('#doctor-grid').innerHTML=docs.length?docs.map(d=>{
    const wait=Math.max(0,Number(d.estimated_wait||0));
    const waitText=wait===0?'No queue ahead':wait<60?`~${wait} min`:`~${Math.floor(wait/60)}h ${wait%60?wait%60+'m':''}`;
    const unavailable=d.status==='Unavailable';
    return `<article class="doctor-card">
      <div class="doctor-card-top"><div class="doctor-avatar ${avatarClass(d.id)}">${escapeHtml(initials(d.name))}</div><span class="status-badge ${statusClass(d.status)}">${escapeHtml(d.status)}</span></div>
      <h3>${escapeHtml(d.name)}</h3><div class="doctor-specialty">${escapeHtml(d.specialty)}</div>
      <div class="hospital-line"><span>⌂</span><span>${escapeHtml(d.hospital_name)}<br>${escapeHtml(d.hospital_city)} · ${escapeHtml(d.hospital_address)}</span></div>
      <div class="doctor-meta"><div class="meta-item"><small>ESTIMATED WAIT*</small><b class="${wait<=30?'wait-good':'wait-warn'}">${escapeHtml(waitText)}</b></div><div class="meta-item"><small>QUEUE AHEAD*</small><b>${Number(d.waiting_count||0)} patients</b></div><div class="meta-item"><small>CONSULTATION</small><b>~${d.avg_minutes} min / patient</b></div><div class="meta-item"><small>CLINIC HOURS</small><b>${escapeHtml(d.schedule)}</b></div></div>
      <div class="doctor-card-footer"><span class="room-label">${escapeHtml(d.room)} · ${escapeHtml(d.hospital_city)}</span><button class="btn ${unavailable?'btn-outline':'btn-primary'}" ${unavailable?'disabled':''} data-action="book" data-id="${d.id}">${unavailable?'Unavailable':'Book a token'} ${unavailable?'':'→'}</button></div>
    </article>`;
  }).join(''):'<div class="empty-state">No doctors match those filters. Try another specialty, status or hospital.</div>';
}
function showModal(html) {
  $('#modal-root').innerHTML=`<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true">${html}</section></div>`;
}
function closeModal(){ $('#modal-root').innerHTML=''; }
function authModal(mode='login') {
  const isReg=mode==='register';
  showModal(`<button class="modal-close" data-action="close-modal" aria-label="Close">×</button>
    <div class="brand"><span class="brand-mark">✚</span><span>QLES<small>Care, without the wait.</small></span></div>
    <h2>${isReg?'Create your account':'Welcome back'}</h2><p class="modal-intro">${isReg?'Join QLES to book and manage your hospital tokens.':'Sign in to view your queue and manage your bookings.'}</p>
    <form id="auth-form" data-mode="${mode}">
      ${isReg?`<label class="form-field"><span>Full name</span><input name="name" required maxlength="100" placeholder="Your full name"></label><label class="form-field"><span>Phone (optional)</span><input name="phone" maxlength="30" placeholder="Phone number"></label>`:''}
      <label class="form-field"><span>Email address</span><input name="email" type="email" required maxlength="180" placeholder="you@example.com"></label>
      <label class="form-field"><span>Password</span><input name="password" type="password" required minlength="${isReg?8:1}" placeholder="${isReg?'At least 8 characters':'Enter your password'}"></label>
      <button class="btn btn-primary form-submit" type="submit">${isReg?'Create patient account':'Log in'} <span>→</span></button>
    </form>
    ${!isReg?`<div class="demo-login-note"><b>Demo patient:</b> patient@qles.demo / Patient123!<br><b>Demo admin:</b> admin@qles.demo / Admin123!</div>`:''}
    <div class="form-foot">${isReg?'Already have an account?':'New to QLES?'} <button class="text-action" data-action="${isReg?'open-login':'open-register'}">${isReg?'Log in':'Create account'}</button></div>`);
}
async function handleAuth(form) {
  const data=Object.fromEntries(new FormData(form).entries()); const mode=form.dataset.mode;
  const button=$('button[type="submit"]',form); button.disabled=true; button.textContent='Please wait…';
  try {
    const result=await api(mode==='register'?'/api/register':'/api/login',{method:'POST',body:JSON.stringify(data)});
    state.user=result.user; renderNav(); closeModal(); toast(`Welcome${state.user.name?' back, '+state.user.name.split(' ')[0]:''}!`);
    if(state.user.role==='admin') navigate('admin'); else navigate('home');
  } catch(e) { toast(e.message,true); button.disabled=false; button.textContent=mode==='register'?'Create patient account →':'Log in →'; }
}
function bookingModal(id) {
  const d=state.doctors.find(x=>Number(x.id)===Number(id)); if(!d)return;
  if(!state.user){authModal('login');toast('Please log in before booking a token.');return;}
  if(state.user.role!=='patient'){toast('Use a patient account to book tokens.',true);return;}
  showModal(`<button class="modal-close" data-action="close-modal" aria-label="Close">×</button><div class="eyebrow">TOKEN BOOKING</div><h2>Book your consultation</h2><p class="modal-intro">Confirm the doctor and visit date. Your token will be saved to your QLES account.</p>
    <div class="booking-detail"><div><small>DOCTOR</small><b>${escapeHtml(d.name)}</b></div><div><small>SPECIALTY</small><b>${escapeHtml(d.specialty)}</b></div><div><small>HOSPITAL</small><b>${escapeHtml(d.hospital_name)}</b></div><div><small>ESTIMATED WAIT TODAY*</small><b>${d.estimated_wait===0?'No queue ahead':'~'+d.estimated_wait+' min'}</b></div></div>
    <form id="booking-form" data-doctor="${d.id}"><label class="form-field"><span>Visit date</span><input type="date" name="visit_date" min="${todayLocal()}" value="${todayLocal()}" required></label><button class="btn btn-primary form-submit" type="submit">Confirm token booking →</button></form><p class="form-foot">This is a demo reservation, not a real hospital appointment.</p>`);
}
async function handleBooking(form) {
  const button=$('button[type="submit"]',form);button.disabled=true;
  try {
    const result=await api('/api/bookings',{method:'POST',body:JSON.stringify({doctor_id:Number(form.dataset.doctor),visit_date:new FormData(form).get('visit_date')})});
    closeModal();toast(`${result.message} Booking confirmed.`);navigate('bookings');
  } catch(e){toast(e.message,true);button.disabled=false;}
}
async function renderBookings(showHeading=true) {
  if(!state.user){authModal('login');return;}
  if(state.user.role!=='patient'){toast('Bookings are available from a patient account.',true);return;}
  state.page='bookings'; updateNavActive('bookings');
  const main=$('main');
  let host=$('#page-content');if(!host){host=document.createElement('section');host.id='page-content';host.className='section-wrap';main.append(host);}
  host.innerHTML=`<div class="page-heading"><div class="eyebrow">YOUR PERSONAL DASHBOARD</div><h1>My bookings</h1><p>Track your tokens, see estimated queue times, and manage upcoming visits.</p></div><div class="loading-state">Loading your bookings…</div>`;
  try {
    state.bookings=await api('/api/bookings');
    const rows=state.bookings;
    host.innerHTML=`<div class="page-heading"><div class="eyebrow">YOUR PERSONAL DASHBOARD</div><h1>My bookings</h1><p>Track your tokens, see estimated queue times, and manage upcoming visits.</p></div>
      ${rows.length?`<div class="booking-list">${rows.map(b=>{
        const active=b.status==='Booked';const today=b.visit_date===todayLocal();
        return `<article class="booking-row"><div><h3>${escapeHtml(b.doctor_name)}</h3><p>${escapeHtml(b.specialty)} · ${escapeHtml(b.hospital_name)}, ${escapeHtml(b.hospital_city)}<br>${escapeHtml(b.visit_date)} · ${active?'Token booked':'Booking '+b.status.toLowerCase()}</p></div>
          <div><small>TOKEN NUMBER</small><div class="queue-big">#${b.token_number}</div></div>
          <div><small>${today&&active?'ESTIMATED WAIT':'STATUS'}</small><b>${today&&active?(b.estimated_wait===0?'You may be next':`~${b.estimated_wait} min`):escapeHtml(b.status)}</b><p>${today&&active?`${b.queue_position} patient(s) ahead`:''}</p></div>
          <div class="booking-actions">${active?`<button class="btn btn-danger" data-action="cancel-booking" data-id="${b.id}">Cancel token</button>`:`<span class="status-badge ${b.status==='Completed'?'status-Available':'status-On-Break'}">${escapeHtml(b.status)}</span>`}</div></article>`;
      }).join('')}</div>`:'<div class="empty-state">You have no bookings yet. Browse the doctor directory to reserve a token.</div>'}
      <button class="btn btn-outline" data-page="home">← Find a doctor</button><div class="notice"><span>ⓘ</span><p><b>Reminder:</b> wait times are estimates from sample queue data. Call the hospital directly for confirmed appointment details.</p></div>`;
  }catch(e){host.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
  if(showHeading) window.scrollTo({top:0,behavior:'smooth'});
}
async function cancelBooking(id) {
  if(!confirm('Cancel this token? This action cannot be undone.'))return;
  try{const r=await api(`/api/bookings/${id}/cancel`,{method:'POST',body:'{}'});toast(r.message);await renderBookings(false);}catch(e){toast(e.message,true);}
}
async function renderAdmin(showHeading=true) {
  if(!state.user||state.user.role!=='admin'){authModal('login');toast('Administrator login is required.',true);return;}
  state.page='admin';updateNavActive('admin');
  let host=$('#page-content');if(!host){host=document.createElement('section');host.id='page-content';host.className='section-wrap';$('main').append(host);}
  host.innerHTML='<div class="page-heading"><h1>Admin dashboard</h1><p>Loading queue overview…</p></div>';
  try {
    const [summary,doctors,bookings]=await Promise.all([api('/api/admin/summary'),api('/api/doctors'),api('/api/admin/bookings')]);
    host.innerHTML=`<div class="page-heading"><div class="eyebrow">HOSPITAL OPERATIONS · DEMO</div><h1>Admin dashboard</h1><p>Manage doctor availability and move the demo queue forward. Changes are stored in the local SQLite database.</p></div>
      <div class="notice"><span>ⓘ</span><p><b>Demo mode:</b> the queue shown here is sample data. Updating it will not notify or affect any real hospital, doctor, or patient.</p></div>
      <div class="admin-stats"><div class="admin-stat"><small>REGISTERED PATIENTS</small><b>${summary.patients}</b></div><div class="admin-stat"><small>LISTED DOCTORS</small><b>${summary.doctors}</b></div><div class="admin-stat"><small>TODAY'S ACTIVE TOKENS</small><b>${summary.active_bookings}</b></div><div class="admin-stat"><small>SERVED TODAY</small><b>${summary.served_today}</b></div></div>
      <div class="admin-panel"><div class="panel-heading"><h3>Doctor availability & queue</h3><small>Sample doctor directory</small></div>
      ${doctors.map(d=>`<div class="admin-doctor-row"><div><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.specialty)} · ${escapeHtml(d.hospital_name)}</small></div><div><small>Current token #${d.current_token} · ~${d.estimated_wait} min estimated</small></div><div><select aria-label="Status for ${escapeHtml(d.name)}" data-doctor-status="${d.id}">${['Available','Consulting','On Break','Unavailable'].map(s=>`<option ${d.status===s?'selected':''}>${s}</option>`).join('')}</select></div><button class="btn btn-outline" data-action="serve-next" data-id="${d.id}">Serve next →</button></div>`).join('')}</div>
      <div class="admin-panel"><div class="panel-heading"><h3>Today's token list</h3><small>${bookings.length} records</small></div><div class="table-wrap"><table><thead><tr><th>TOKEN</th><th>PATIENT</th><th>DOCTOR</th><th>HOSPITAL</th><th>STATUS</th></tr></thead><tbody>${bookings.length?bookings.map(b=>`<tr><td><b>#${b.token_number}</b></td><td>${escapeHtml(b.patient_name)}<br><small>${escapeHtml(b.patient_email)}</small></td><td>${escapeHtml(b.doctor_name)}<br><small>${escapeHtml(b.specialty)}</small></td><td>${escapeHtml(b.hospital_name)}</td><td><span class="status-badge ${b.status==='Booked'?'status-Available':b.status==='Completed'?'status-Consulting':'status-On-Break'}">${escapeHtml(b.status)}</span></td></tr>`).join(''):'<tr><td colspan="5">No bookings for today.</td></tr>'}</tbody></table></div></div>`;
  }catch(e){host.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
  if(showHeading)window.scrollTo({top:0,behavior:'smooth'});
}
function updateNavActive(page){$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===page));}
function navigate(page) {
  closeModal();
  if(page==='bookings' || page==='admin') {
    $('#hero').classList.add('hidden');$('.stats-strip').classList.add('hidden');$('#directory').classList.add('hidden');$('.how-section').classList.add('hidden');$('.bottom-cta').classList.add('hidden');
    if(page==='bookings'){renderBookings();return;}
    if(page==='admin'){renderAdmin();return;}
  }
  state.page='home';updateNavActive('home');
  const host=$('#page-content');if(host)host.remove();
  $('#hero').classList.remove('hidden');$('.stats-strip').classList.remove('hidden');$('#directory').classList.remove('hidden');$('.how-section').classList.remove('hidden');$('.bottom-cta').classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
document.addEventListener('click',async e=>{
  const pageLink=e.target.closest('[data-page]');
  if(pageLink){e.preventDefault();const p=pageLink.dataset.page; if(p==='home'){$('#hero').classList.remove('hidden');$('.stats-strip').classList.remove('hidden');$('#directory').classList.remove('hidden');$('.how-section').classList.remove('hidden');$('.bottom-cta').classList.remove('hidden');}else{$('#hero').classList.add('hidden');$('.stats-strip').classList.add('hidden');$('#directory').classList.add('hidden');$('.how-section').classList.add('hidden');$('.bottom-cta').classList.add('hidden');}navigate(p);return;}
  const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
  if(a==='open-login')authModal('login');
  if(a==='open-register')authModal('register');
  if(a==='close-modal')closeModal();
  if(a==='backdrop'&&e.target===el)closeModal();
  if(a==='book')bookingModal(el.dataset.id);
  if(a==='logout'){try{await api('/api/logout',{method:'POST',body:'{}'});state.user=null;renderNav();toast('You have logged out.');navigate('home');}catch(err){toast(err.message,true);}}
  if(a==='cancel-booking')cancelBooking(el.dataset.id);
  if(a==='serve-next'){try{const r=await api(`/api/admin/doctors/${el.dataset.id}/serve-next`,{method:'POST',body:'{}'});toast(r.message);await renderAdmin(false);}catch(err){toast(err.message,true);}}
});
document.addEventListener('submit',e=>{
  if(e.target.id==='auth-form'){e.preventDefault();handleAuth(e.target);}
  if(e.target.id==='booking-form'){e.preventDefault();handleBooking(e.target);}
});
document.addEventListener('change',async e=>{
  if(e.target.matches('[data-doctor-status]')){
    try{await api(`/api/admin/doctors/${e.target.dataset.doctorStatus}`,{method:'PATCH',body:JSON.stringify({status:e.target.value})});toast('Doctor status updated.');await renderAdmin(false);}
    catch(err){toast(err.message,true);}
  }
});
['directory-search','specialty-filter','status-filter','hospital-filter'].forEach(id=>$('#'+id).addEventListener('input',renderDoctors));
$('#search-input').addEventListener('keydown',e=>{if(e.key==='Enter'){$('#directory-search').value=e.target.value;renderDoctors();$('#directory').scrollIntoView({behavior:'smooth'});}});
$('#search-button').addEventListener('click',()=>{$('#directory-search').value=$('#search-input').value;renderDoctors();$('#directory').scrollIntoView({behavior:'smooth'});});
loadInitial();
