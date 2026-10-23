import sharp from 'sharp';
// Follow the same local control through at most eight image pixels of UI motion.
// Reject missing/replaced targets; never widen the search to another control.
export async function matchVisualTarget(source,current,{x,y,width,height}){
 const radius=24,maxShift=8,left=Math.max(0,x-radius),top=Math.max(0,y-radius),w=Math.min(48,width-left),h=Math.min(48,height-top);
 const searchLeft=Math.max(0,left-maxShift),searchTop=Math.max(0,top-maxShift),searchRight=Math.min(width,left+w+maxShift),searchBottom=Math.min(height,top+h+maxShift);
 const [a,b]=await Promise.all([
  sharp(source).extract({left,top,width:w,height:h}).removeAlpha().raw().toBuffer(),
  sharp(current).extract({left:searchLeft,top:searchTop,width:searchRight-searchLeft,height:searchBottom-searchTop}).removeAlpha().raw().toBuffer(),
 ]);
 const stride=searchRight-searchLeft;let best=null;
 for(let dy=-maxShift;dy<=maxShift;dy++)for(let dx=-maxShift;dx<=maxShift;dx++){
  const bx=left+dx-searchLeft,by=top+dy-searchTop;if(bx<0||by<0||bx+w>stride||by+h>searchBottom-searchTop)continue;
  let diff=0;for(let row=0;row<h;row++)for(let col=0;col<w*3;col++)diff+=Math.abs(a[row*w*3+col]-b[((by+row)*stride+bx)*3+col]);diff/=w*h*3;
  if(!best||diff<best.diff)best={dx,dy,diff};
 }
 return best?.diff<=12?best:null;
}
