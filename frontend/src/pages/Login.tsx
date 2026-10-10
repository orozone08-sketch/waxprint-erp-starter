import {FormEvent, useState} from 'react'
import {LogIn, LockKeyhole} from 'lucide-react'
import {clearStoredAuth, type AuthSession, login} from '../api'

export default function Login({onLogin,title='WaxPrint ERP',subtitle='Sign in to continue',usernameLabel='Username',requiredRole,companySelector=false}:{onLogin:(session:AuthSession)=>void;title?:string;subtitle?:string;usernameLabel?:string;requiredRole?:string;companySelector?:boolean}){
 const[username,setUsername]=useState('')
 const[password,setPassword]=useState('')
 const[company,setCompany]=useState('aditya')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const submit=async(event:FormEvent)=>{
  event.preventDefault()
  setLoading(true);setError('')
  try{
   const session=await login(username,password,company)
   if(requiredRole&&session.user.role.toUpperCase()!==requiredRole.toUpperCase()&&!(requiredRole==='ADMIN'&&session.user.role.toUpperCase()==='SUPER_ADMIN')){
    clearStoredAuth()
    throw new Error('This account does not have admin access.')
   }
   onLogin(session)
  }catch(x){
   setError(String(x))
  }finally{
   setLoading(false)
  }
 }

 return <main className="loginPage">
  <section className="loginPanel">
   <div className="loginBrand">
    <img src="/aditya360-logo.png" alt="ADITYA360" />
    <span><b>{title}</b><small>{subtitle}</small></span>
   </div>
   <form className="loginForm" onSubmit={submit}>
    {companySelector&&<label>Company<select value={company} onChange={e=>setCompany(e.target.value)}><option value="aditya">Aditya International</option><option value="sunmoon">Sunmoon Technology</option></select></label>}
    <label>{usernameLabel}<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoFocus required /></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required /></label>
    {error&&<div className="errorBox"><LockKeyhole size={15}/>{error}</div>}
    <button className="primaryBtn" type="submit" disabled={loading}><LogIn size={16}/>{loading?'Signing in...':'Login'}</button>
   </form>
  </section>
 </main>
}
