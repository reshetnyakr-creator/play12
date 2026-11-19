/* Read the production SVG contours; no equal-width replacement keys. */
const fs=require('node:fs'),path=require('node:path');
function contours(){
 const text=fs.readFileSync(path.join(__dirname,'../renderer/assets/play12-v07/Piano_Roll.svg'),'utf8');
 const stack=[{hidden:false,m:[1,0,0,1,0,0]}],faces=[];
 const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
 for(const token of text.matchAll(/<\/?([\w:]+)\b([^>]*?)>/g)){
  const [raw,tag,tail]=token;if(raw.startsWith('</')){stack.pop();continue;}
  const attrs=Object.fromEntries([...tail.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])),parent=stack.at(-1);
  let matrix=[1,0,0,1,0,0];for(const m of (attrs.transform||'').matchAll(/(matrix|translate|scale)\(([^)]+)\)/g)){const v=m[2].trim().split(/[ ,]+/).map(Number);matrix=mul(matrix,m[1]==='matrix'?v:m[1]==='translate'?[1,0,0,1,v[0],v[1]||0]:[v[0],0,0,v[1]??v[0],0,0]);}
  const state={hidden:parent.hidden||attrs.display==='none'||/display\s*:\s*none/.test(attrs.style||''),m:mul(parent.m,matrix)};
  if(tag==='path'&&!state.hidden){
   const values=attrs.d.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g);let i=0,x=0,y=0,sx=0,sy=0,command;const points=[];
   const add=(a,b)=>points.push([state.m[0]*a+state.m[2]*b+state.m[4],state.m[1]*a+state.m[3]*b+state.m[5]]);
   const curve=(p,t)=>((1-t)**3*p[0]+3*(1-t)**2*t*p[1]+3*(1-t)*t*t*p[2]+t**3*p[3]);
   const roots=p=>{const a=-p[0]+3*p[1]-3*p[2]+p[3],b=2*(p[0]-2*p[1]+p[2]),c=p[1]-p[0];if(Math.abs(a)<1e-10)return Math.abs(b)<1e-10?[]:[-c/b];const d=b*b-4*a*c;return d<0?[]:[(-b+Math.sqrt(d))/(2*a),(-b-Math.sqrt(d))/(2*a)];};
   while(i<values.length){if(/^[a-z]$/i.test(values[i]))command=values[i++];
    if(command==='z'){x=sx;y=sy;add(x,y);continue;}
    const n=()=>Number(values[i++]);
    if(command==='m'||command==='l'){x+=n();y+=n();add(x,y);if(command==='m'){sx=x;sy=y;command='l';}}
    else if(command==='h'){x+=n();add(x,y);}else if(command==='v'){y+=n();add(x,y);}
    else if(command==='c'){const q=Array.from({length:6},n),cx=[x,x+q[0],x+q[2],x+q[4]],cy=[y,y+q[1],y+q[3],y+q[5]];
     add(x,y);add(cx[3],cy[3]);for(const t of [...roots(cx),...roots(cy)])if(t>0&&t<1)add(curve(cx,t),curve(cy,t));x=cx[3];y=cy[3];
    }else throw Error('Unsupported production path command '+command);
   }
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys)+128,bottom=Math.max(...ys)+128;
   faces.push({left,right,top,bottom,width:right-left,height:bottom-top});
  }
  if(!raw.endsWith('/>'))stack.push(state);
 }
 return faces.sort((a,b)=>(a.left+a.right)-(b.left+b.right));
}
module.exports=contours;
