import {type AppRole} from './api'

const allRoles:AppRole[]=['ADMIN','ACCOUNTS','STAFF','OPERATOR']

export const pageAccess:Record<string,AppRole[]>={
 dashboard:['ADMIN'],
 inbox:allRoles,
 jobs:allRoles,
 customers:['ADMIN','ACCOUNTS','STAFF'],
 magics:['ADMIN','STAFF','OPERATOR'],
 platforms:['ADMIN','STAFF','OPERATOR'],
 printing:['ADMIN','STAFF','OPERATOR'],
 qc:['ADMIN','STAFF','OPERATOR'],
 reshoots:['ADMIN','STAFF','OPERATOR'],
 weight:['ADMIN','STAFF','OPERATOR'],
 dispatch:['ADMIN','STAFF','OPERATOR'],
 returns:['ADMIN','STAFF'],
 billing:['ADMIN','ACCOUNTS'],
 inventory:['ADMIN','STAFF'],
 expenses:['ADMIN','ACCOUNTS','STAFF','OPERATOR'],
 reports:['ADMIN'],
 settings:['ADMIN']
}

export function normalizeRole(role:string|undefined):AppRole{
 const upper=(role||'STAFF').toUpperCase()
 return (['ADMIN','ACCOUNTS','STAFF','OPERATOR'] as string[]).includes(upper)?upper as AppRole:'STAFF'
}

export function normalizePage(page:string){
 return page==='employees'||page==='travel'? 'expenses':page
}

export function canAccessPage(page:string,role:string|undefined){
 const pageKey=normalizePage(page)
 return (pageAccess[pageKey]||[]).includes(normalizeRole(role))
}

export function roleHomePage(role:string|undefined){
 const normalized=normalizeRole(role)
 if(normalized==='ADMIN')return 'dashboard'
 if(normalized==='ACCOUNTS')return 'inbox'
 return 'inbox'
}

export function resolvePage(page:string,role:string|undefined){
 return canAccessPage(page,role)?normalizePage(page):roleHomePage(role)
}
