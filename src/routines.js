const normalized=s=>String(s||'').replace(/\s+/g,' ').trim();
export function routineAction({controls=[],text=''}={}){
 const enabled=controls.filter(c=>!c.disabled),body=normalized(text);
 // Exact controls only. Confirmation, purchase and choice dialogs stay with GPT.
 if(/\b(?:buy|purchase|comprar|compra|choose|select|pick|elige|elegir)\b/i.test(body))return null;
 const prize=/\b(?:total win|you won|congratulations|premio total|ganancia total|has ganado)\b/i.test(body);
 const candidates=enabled.filter(c=>prize&&/^(?:click|tap) to continue$|^continue$|^collect$|^ok$|^continuar$|^cobrar$/i.test(normalized(c.label)));
 return prize&&candidates.length===1?{kind:'prize',control:candidates[0]}:null;
}
export function roundEvidence({controls=[],text=''}={}){
 const body=normalized(text),spins=controls.filter(c=>/^(?:spin|girar|tirar)$/i.test(normalized(c.label)));
 if(routineAction({controls,text}))return 'prize';
 if(/\b(?:free spins? remaining|spins? left|choose|pick)\b|(?:buy|purchase).{0,80}\?/i.test(body))return 'unknown';
 if(spins.length===1)return spins[0].disabled?'active':'idle';
 return 'unknown';
}
