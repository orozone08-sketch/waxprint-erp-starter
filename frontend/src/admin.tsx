import React, {useEffect, useState} from 'react'
import ReactDOM from 'react-dom/client'
import {ArrowLeft, ExternalLink, LogOut} from 'lucide-react'
import AdminPanel from './pages/AdminPanel'
import Login from './pages/Login'
import {clearStoredAuth, getJson, getStoredAuth, setStoredAuth, type AuthSession, type AuthUser} from './api'
import './styles.css'

function goToMain(page:string){
 window.location.href=`/?page=${encodeURIComponent(page)}`
}

function scrollAdmin(id:string){
 document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})
}

function openAdminSection(id:string){
 const url=new URL(window.location.href)
 if(url.searchParams.has('module')){
  url.searchParams.delete('module')
  url.hash=id
  window.location.href=`${url.pathname}${url.search}${url.hash}`
  return
 }
 scrollAdmin(id)
}

function AdminApp(){
 const[auth,setAuth]=useState<AuthSession|null>(()=>getStoredAuth())
 const[checking,setChecking]=useState(()=>Boolean(getStoredAuth()))

 useEffect(()=>{
  const stored=getStoredAuth()
  if(!stored){setChecking(false);return}
  getJson<AuthUser>('/api/auth/me').then(user=>{
   const session={...stored,user}
   setStoredAuth(session)
   setAuth(session)
  }).catch(()=>{
   clearStoredAuth()
   setAuth(null)
  }).finally(()=>setChecking(false))
 },[])

 const logout=()=>{
  clearStoredAuth()
  setAuth(null)
 }

 useEffect(()=>{
  if(auth&&auth.user.role.toUpperCase()!=='ADMIN')window.location.replace('/?page=inbox')
 },[auth])

 if(checking)return <main className="loginPage"><section className="loginPanel">Checking admin login...</section></main>
 if(!auth)return <Login onLogin={setAuth} title="WaxPrint Admin" subtitle="Admin login required" />

 const isAdmin=auth.user.role.toUpperCase()==='ADMIN'
 if(!isAdmin)return <main className="loginPage"><section className="loginPanel">Admin access required. Redirecting to ERP...</section></main>

 return <div className="adminShell">
  <aside className="adminSideNav">
   <div className="adminSideBrand">
    <img src="/aditya360-logo.png" alt="ADITYA360" />
    <span><b>WaxPrint Admin</b><small>{auth.user.display_name} / {auth.user.role}</small></span>
   </div>
   <div className="adminSideMenu">
    <div id="admin-data-modules-slot" className="adminSideDataSlot"></div>
   </div>
   <div className="adminSideActions">
    <button type="button" onClick={()=>goToMain(isAdmin?'dashboard':'inbox')}><ArrowLeft size={16}/>ERP</button>
    {isAdmin&&<button type="button" onClick={()=>goToMain('settings')}><ExternalLink size={16}/>Settings</button>}
    <button type="button" onClick={logout}><LogOut size={16}/>Logout</button>
   </div>
  </aside>
  <main className="adminStandalone">
   <header className="adminStandaloneTop">
    <div>
     <p className="eyebrow">Separate Admin</p>
     <h1>Control Panel</h1>
    </div>
    <div className="adminStandaloneActions">
     <button type="button" className="secondaryBtn" onClick={()=>goToMain(isAdmin?'dashboard':'inbox')}><ArrowLeft size={16}/>ERP</button>
     {isAdmin&&<button type="button" className="primaryBtn" onClick={()=>goToMain('settings')}><ExternalLink size={16}/>Settings</button>}
     <button type="button" className="secondaryBtn" onClick={logout}><LogOut size={16}/>Logout</button>
    </div>
   </header>
   <AdminPanel setPage={goToMain}/>
  </main>
 </div>
}

ReactDOM.createRoot(document.getElementById('admin-root')!).render(<React.StrictMode><AdminApp/></React.StrictMode>)
