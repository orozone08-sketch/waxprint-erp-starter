import {useEffect, useState} from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Jobs from './pages/Jobs'
import Customers from './pages/Customers'
import Magics from './pages/Magics'
import Platforms from './pages/Platforms'
import Printing from './pages/Printing'
import QC from './pages/QC'
import Reshoots from './pages/Reshoots'
import Weight from './pages/Weight'
import Dispatch from './pages/Dispatch'
import Returns from './pages/Returns'
import Billing from './pages/Billing'
import Inventory from './pages/Inventory'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'
import Placeholder from './pages/Placeholder'
import {type AuthSession, PUBLIC_SESSION} from './api'
import {canAccessPage, resolvePage} from './authz'

const initialPage=()=>new URLSearchParams(window.location.search).get('page')||'dashboard'

export default function App(){
 const[page,setPageState]=useState(initialPage)
 const[auth]=useState<AuthSession>(PUBLIC_SESSION)

 const commitPage=(target:string,session=auth)=>{
  const next=resolvePage(target,session.user.role)
  setPageState(next)
  const url=new URL(window.location.href)
  url.searchParams.set('page',next)
  window.history.replaceState(null,'',url)
 }

 const activePage=resolvePage(page,auth.user.role)
 useEffect(()=>{if(activePage!==page)commitPage(activePage)},[auth,activePage,page])

 let content:any
 switch(activePage){
  case'dashboard':content=<Dashboard setPage={commitPage}/>;break
  case'inbox':content=<Inbox/>;break
  case'jobs':content=<Jobs/>;break
  case'customers':content=<Customers/>;break
  case'magics':content=<Magics/>;break
  case'platforms':content=<Platforms role={auth.user.role}/>;break
  case'printing':content=<Printing/>;break
  case'qc':content=<QC/>;break
  case'reshoots':content=<Reshoots/>;break
  case'weight':content=<Weight role={auth.user.role}/>;break
  case'dispatch':content=<Dispatch role={auth.user.role}/>;break
  case'returns':content=<Returns/>;break
  case'billing':content=<Billing/>;break
  case'inventory':content=<Inventory/>;break
  case'expenses':content=<Expenses role={auth.user.role}/>;break
  case'reports':content=<Reports/>;break
  case'settings':content=<SettingsPage/>;break
  default:content=canAccessPage(activePage,auth.user.role)?<Placeholder page={activePage}/>:<Inbox/>
 }
 return <Layout page={activePage} setPage={commitPage} user={auth.user}>{content}</Layout>
}