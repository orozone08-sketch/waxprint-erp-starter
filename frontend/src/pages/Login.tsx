import {FormEvent, useState} from 'react'
import {LogIn, LockKeyhole} from 'lucide-react'
import {type AuthSession, login} from '../api'

export default function Login({onLogin,title='WaxPrint ERP',subtitle='Sign in to continue'}:{onLogin:(session:AuthSession)=>void;title?:string;subtitle?:string}){
 const[username,setUsername]=useState('')
 const[password,setPassword]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const submit=async(event:FormEvent)=>{
  event.preventDefault()
  setLoading(true);setError('')
  try{
   onLogin(await login(username,password))
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
    <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoFocus required /></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required /></label>
    {error&&<div className="errorBox"><LockKeyhole size={15}/>{error}</div>}
    <button className="primaryBtn" type="submit" disabled={loading}><LogIn size={16}/>{loading?'Signing in...':'Login'}</button>
   </form>
  </section>
 </main>
}
