export function jumpTo(id:string){
 const target=document.getElementById(id)
 if(!target)return
 target.scrollIntoView({behavior:'smooth',block:'start'})
 window.history.replaceState(null,'',`#${id}`)
}
