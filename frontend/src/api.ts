// Production assets and API routes are served by the same Worker; use relative
// URLs so local development settings never leak into the deployed bundle.
export const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export type AppRole='SUPER_ADMIN'|'ADMIN'|'ACCOUNTS'|'STAFF'|'OPERATOR'
export type AuthUser={id:number;username:string;display_name:string;role:AppRole|string;company_id:number|null;active:boolean;created_at?:string}
export type AuthSession={token:string;user:AuthUser;active_company_id:number;active_company_name?:string}

const AUTH_KEY='waxprint.auth'

export function getStoredAuth():AuthSession|null{
 try{
  const raw=window.localStorage.getItem(AUTH_KEY)
  return raw?JSON.parse(raw) as AuthSession:null
 }catch{
  return null
 }
}

export function setStoredAuth(session:AuthSession){
 window.localStorage.setItem(AUTH_KEY,JSON.stringify(session))
}

export function clearStoredAuth(){
 window.localStorage.removeItem(AUTH_KEY)
}

export async function logout(){
 const response=await fetch(`${API}/api/auth/logout`,{method:'POST',credentials:'include'})
 if(!response.ok)throw new Error(await errorText(response))
 clearStoredAuth()
}

export function authHeaders(headers:Record<string,string>={}):Record<string,string>{
 const session=getStoredAuth()
 return session?{...headers,Authorization:`Bearer ${session.token}`,'X-Company-ID':String(session.active_company_id)}:headers
}

async function errorText(response:Response){
 const text=await response.text()
 try{
  const data=JSON.parse(text)
  return data.detail||data.message||text
 }catch{
  return text||`${response.status} ${response.statusText}`
 }
}

export async function getJson<T>(path:string):Promise<T>{
 const r=await fetch(`${API}${path}`,{headers:authHeaders()})
 if(!r.ok)throw new Error(await errorText(r))
 return r.json()
}

export async function postJson<T>(path:string, body:any):Promise<T>{
 const r=await fetch(`${API}${path}`,{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body)})
 if(!r.ok)throw new Error(await errorText(r))
 return r.json()
}

export async function postForm<T>(path:string, body:FormData):Promise<T>{
 const r=await fetch(`${API}${path}`,{method:'POST',headers:authHeaders(),body})
 if(!r.ok)throw new Error(await errorText(r))
 return r.json()
}

export async function login(username:string,password:string,companySlug='aditya'):Promise<AuthSession>{
 const session=await postJson<AuthSession>('/api/auth/login',{username,password,company_slug:companySlug})
 setStoredAuth(session)
 return session
}

export async function fetchBlob(path:string):Promise<Blob>{
 const response=await fetch(`${API}${path}`,{headers:authHeaders()})
 if(!response.ok)throw new Error(await errorText(response))
 return response.blob()
}

export async function downloadFile(path:string, filename:string){
 const blob=await fetchBlob(path)
 const url=window.URL.createObjectURL(blob)
 const link=document.createElement('a')
 link.href=url
 link.download=filename
 document.body.appendChild(link)
 link.click()
 link.remove()
 window.setTimeout(()=>window.URL.revokeObjectURL(url),1000)
}

export async function openFile(path:string){
 const blob=await fetchBlob(path)
 const url=window.URL.createObjectURL(blob)
 window.open(url,'_blank','noopener,noreferrer')
 window.setTimeout(()=>window.URL.revokeObjectURL(url),60_000)
}
