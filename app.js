import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/GLTFLoader.js';

/*
  TALHA STUDIO — from-scratch 3D showroom starter.
  Optional downloaded GLB model: put it at public/models/suit.glb and set MODEL_URL below.
  This project uses sample product data and does not process real payments.
*/
const MODEL_URL = './public/models/suit.glb'; // optional; if absent, procedural mannequin/garment is shown
const products = [
 {id:'midnight',name:'Midnight Classic Suit',category:'Men',type:'Stitched',price:8500,color:'#172b49',desc:'A refined deep-navy look with a clean, timeless silhouette.',tag:'BESTSELLER'},
 {id:'sand',name:'Sandstone Cotton Suit',category:'Men',type:'Unstitched',price:6200,color:'#9b8061',desc:'Breathable cotton in a warm sand tone for everyday elegance.',tag:'NEW'},
 {id:'olive',name:'Olive Heritage Suit',category:'Women',type:'Unstitched',price:7400,color:'#53674e',desc:'A rich earthy shade with a graceful, versatile finish.',tag:'LIMITED'},
 {id:'noir',name:'Noir Formal Suit',category:'Women',type:'Stitched',price:11900,color:'#171717',desc:'An understated black formal look with a premium finish.',tag:'PREMIUM'}
];
let activeProduct=products[0], activeColor=activeProduct.color, cart=[];
const $=id=>document.getElementById(id);
const money=n=>'PKR '+n.toLocaleString('en-PK');
let toastTimer;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2300)}
$('year').textContent=new Date().getFullYear();

const sceneHost=$('scene');
const scene=new THREE.Scene(); scene.background=new THREE.Color('#1b1d1c'); scene.fog=new THREE.Fog('#1b1d1c',10,24);
const camera=new THREE.PerspectiveCamera(43,1,.1,100); camera.position.set(6.7,4.7,8.7);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25; sceneHost.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,1.25,0); controls.enableDamping=true; controls.dampingFactor=.06; controls.minDistance=4; controls.maxDistance=15; controls.maxPolarAngle=Math.PI*.48;
scene.add(new THREE.HemisphereLight('#fff0d5','#303b3b',2.1));
const keyLight=new THREE.DirectionalLight('#ffe0ac',3.2); keyLight.position.set(-4,8,5); keyLight.castShadow=true; keyLight.shadow.mapSize.set(1024,1024); scene.add(keyLight);
const fill=new THREE.PointLight('#b6d5ff',45,16);fill.position.set(4,4,0);scene.add(fill);
function mat(color,rough=.65,metal=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
function box(w,h,d,material,x,y,z,cast=true){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;scene.add(m);return m}
const floorMat=mat('#bcb4a5',.85), wallMat=mat('#383b38'), wood=mat('#65452e'), brass=mat('#b3955c',.3,.65), dark=mat('#171a19'), clothMat=mat(activeColor,.86);
box(14,.18,12,floorMat,0,-.1,0,false);
box(14,4.5,.18,wallMat,0,2.15,-5.5,false);
box(.18,4.5,11,wallMat,-7,2.15,0,false);
box(.18,4.5,11,wallMat,7,2.15,0,false);
// Decorative ceiling beams and warm ceiling lights
for(let x=-5;x<=5;x+=2.5){box(.12,.12,10,wood,x,4.35,0,false);const lamp=new THREE.PointLight('#ffd59a',26,7);lamp.position.set(x,4.1,0);scene.add(lamp);const bulb=new THREE.Mesh(new THREE.SphereGeometry(.09,16,12),new THREE.MeshBasicMaterial({color:'#ffe3ae'}));bulb.position.set(x,4.02,0);scene.add(bulb)}
// Back-wall panels and boutique signage
for(let x=-4.8;x<=4.8;x+=1.6){box(1.35,2.7,.08,wood,x,2,-5.36,false);box(1.15,2.48,.05,dark,x,2,-5.28,false)}
// Sign board
box(3.6,.72,.14,brass,0,3.48,-5.1,false);box(3.45,.58,.06,dark,0,3.48,-5.0,false);
// rack builder
function createRack(x,z,rotation=0){
 const group=new THREE.Group();scene.add(group);group.position.set(x,0,z);group.rotation.y=rotation;
 const metal=mat('#b5a27d',.25,.7);
 const rail=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,2.55,12),metal);rail.rotation.z=Math.PI/2;rail.position.y=2.65;rail.castShadow=true;group.add(rail);
 for(const xx of [-1.3,1.3]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,2.65,10),metal);leg.position.set(xx,1.35,0);group.add(leg);const foot=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.07,12),dark);foot.position.set(xx,.05,0);group.add(foot)}
 for(let i=0;i<6;i++){const xoff=-1.08+i*.43;const hanger=new THREE.Group();hanger.position.set(xoff,2.5,0);const hook=new THREE.Mesh(new THREE.TorusGeometry(.07,.012,6,12,Math.PI*1.6),brass);hook.rotation.x=Math.PI/2;hook.position.y=.12;hanger.add(hook);
 const c=new THREE.Color().setHSL(.56+i*.055,.35,.24+i*.025);const garment=new THREE.Mesh(new THREE.BoxGeometry(.31,.92,.13),mat(c, .95));garment.position.y=-.48;garment.castShadow=true;hanger.add(garment);
 const shoulders=new THREE.Mesh(new THREE.BoxGeometry(.43,.13,.15),mat(c,.95));shoulders.position.y=-.08;hanger.add(shoulders);group.add(hanger)}
 return group;
}
createRack(-4.4,-1.4,.1);createRack(4.4,-1.4,-.1);createRack(-3.7,2.2,.08);createRack(3.7,2.2,-.08);
// island display table
box(2.5,.18,1.4,wood,0,.85,-.25);for(const x of [-1,1])for(const z of [-.5,.5])box(.09,.8,.09,brass,x,.4,-.25+z);
// folded fabric stacks
for(let i=0;i<4;i++){const colors=['#243955','#8c7255','#343d32','#9a8a76'];box(.72,.13,.8,mat(colors[i]),-.7,1.02+i*.14,-.25,false)}
// mannequins, torso and stylized suit jacket
function createMannequin(x,z,color){
 const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
 const skin=mat('#b7a18b',.75), pants=mat('#292d2e',.9), suit=mat(color,.9);
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.55,12),brass);pole.position.y=.28;g.add(pole);
 const legs=new THREE.Mesh(new THREE.BoxGeometry(.42,.88,.28),pants);legs.position.y=.92;g.add(legs);
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.35,.72,6,12),suit);torso.position.y=1.88;torso.castShadow=true;g.add(torso);
 const shirt=new THREE.Mesh(new THREE.BoxGeometry(.13,.73,.04),mat('#eee8dc'));shirt.position.set(0,1.88,.33);g.add(shirt);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.2,20,16),skin);head.position.y=2.62;g.add(head);
 const neck=new THREE.Mesh(new THREE.CylinderGeometry(.09,.1,.15,12),skin);neck.position.y=2.42;g.add(neck);
 const armGeo=new THREE.CapsuleGeometry(.095,.58,4,8);
 for(const side of [-1,1]){const arm=new THREE.Mesh(armGeo,suit);arm.position.set(side*.43,1.92,0);arm.rotation.z=side*.13;g.add(arm)}
 // lapels
 for(const side of [-1,1]){const lapel=new THREE.Mesh(new THREE.BoxGeometry(.12,.48,.045),mat('#d5c5a6'));lapel.position.set(side*.1,2.02,.355);lapel.rotation.z=side*.22;g.add(lapel)}
 return g;
}
const mannequin=createMannequin(-1.8,1.05,activeColor);createMannequin(1.8,1.05,'#343331');
// logo-like plaque text via canvas texture
function textTexture(text){const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#171a19';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#c8ad78';ctx.font='bold 90px Georgia';ctx.textAlign='center';ctx.fillText(text,c.width/2,145);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex}
const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.3,.6),new THREE.MeshBasicMaterial({map:textTexture('TALHA STUDIO')}));sign.position.set(0,3.48,-4.94);scene.add(sign);
// optional GLB replacement: add model in front of the main mannequin if file exists
let loadedModel=null;
new GLTFLoader().load(MODEL_URL,gltf=>{loadedModel=gltf.scene;loadedModel.scale.setScalar(1.25);loadedModel.position.set(0,0,1.2);loadedModel.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});scene.add(loadedModel);$('sceneLoading').classList.add('hidden')},undefined,()=>{$('sceneLoading').classList.add('hidden')});
function resize(){const w=sceneHost.clientWidth,h=sceneHost.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
new ResizeObserver(resize).observe(sceneHost);resize();
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
$('resetView').addEventListener('click',()=>{camera.position.set(6.7,4.7,8.7);controls.target.set(0,1.25,0);controls.update()});
$('zoomIn').onclick=()=>{camera.position.multiplyScalar(.88);controls.update()};$('zoomOut').onclick=()=>{camera.position.multiplyScalar(1.12);controls.update()};

function garmentHTML(color){return `<div class="mini-garment" style="background:${color}"></div>`}
function renderProducts(category='All'){
 const filtered=products.filter(p=>category==='All'||p.category===category||p.type===category);
 $('resultCount').textContent=`${filtered.length} piece${filtered.length===1?'':'s'}`;
 $('productGrid').innerHTML=filtered.map(p=>`<article class="product-card" data-id="${p.id}"><div class="card-image"><span class="tag">${p.tag}</span>${garmentHTML(p.color)}</div><div class="card-info"><small>${p.category.toUpperCase()} · ${p.type.toUpperCase()}</small><h3>${p.name}</h3><div class="card-bottom"><strong>${money(p.price)}</strong><button class="quick-add" data-add="${p.id}" aria-label="Add ${p.name} to bag">＋</button></div></div></article>`).join('');
 document.querySelectorAll('.product-card').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('[data-add]'))return;selectProduct(card.dataset.id)}));
 document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();addToCart(btn.dataset.add)}));
}
function selectProduct(id){const p=products.find(x=>x.id===id);if(!p)return;activeProduct=p;activeColor=p.color;$('productName').textContent=p.name;$('productCategory').textContent=`${p.category.toUpperCase()} · ${p.type.toUpperCase()}`;$('productPrice').textContent=money(p.price);$('productDescription').textContent=p.desc;$('productPreview').innerHTML=garmentHTML(p.color);document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('selected',s.dataset.color.toLowerCase()===p.color.toLowerCase()));mannequin.children.forEach(o=>{if(o.material?.color&&o.geometry?.type==='CapsuleGeometry')o.material.color.set(p.color)});toast(`${p.name} selected`);$('showroom').scrollIntoView({behavior:'smooth',block:'start'})}
document.querySelectorAll('.category').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.category').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderProducts(btn.dataset.category)}));
document.querySelectorAll('.swatch').forEach(btn=>btn.addEventListener('click',()=>{activeColor=btn.dataset.color;document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('selected',s===btn));$('productPreview').innerHTML=garmentHTML(activeColor);mannequin.children.forEach(o=>{if(o.material?.color&&o.geometry?.type==='CapsuleGeometry')o.material.color.set(activeColor)});}));
function addToCart(id){const p=products.find(x=>x.id===id);if(!p)return;const found=cart.find(x=>x.id===id);if(found)found.qty++;else cart.push({...p,qty:1,color:id===activeProduct.id?activeColor:p.color});updateCart();toast(`${p.name} added to your bag`)}
function updateCart(){$('cartCount').textContent=cart.reduce((s,p)=>s+p.qty,0);$('cartItems').innerHTML=cart.length?cart.map(p=>`<div class="cart-item"><div class="cart-thumb">${garmentHTML(p.color)}</div><div class="cart-item-info"><b>${p.name}</b><small>${p.qty} × ${money(p.price)}</small></div><button class="remove-item" data-remove="${p.id}">Remove</button></div>`).join(''):'<p class="muted">Your bag is waiting for something special.</p>';$('cartTotal').textContent=money(cart.reduce((s,p)=>s+p.price*p.qty,0));document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart=cart.filter(p=>p.id!==b.dataset.remove);updateCart()})}
$('addToCart').onclick=()=>addToCart(activeProduct.id);$('cartBtn').onclick=()=>$('cartDialog').showModal();$('detailsBtn').onclick=()=>{$('detailTitle').textContent=activeProduct.name;$('detailText').textContent=activeProduct.desc+' Price: '+money(activeProduct.price)+'. This is sample catalog data.';$('detailsDialog').showModal()};
$('checkoutBtn').onclick=()=>toast('Demo checkout only — payment has not been configured.');
$('searchBtn').onclick=()=>{const term=prompt('Search the collection');if(term===null)return;const found=products.find(p=>p.name.toLowerCase().includes(term.toLowerCase())||p.category.toLowerCase().includes(term.toLowerCase())||p.type.toLowerCase().includes(term.toLowerCase()));if(found){selectProduct(found.id)}else toast('No matching sample product found')};
$('menuBtn').onclick=()=>document.querySelector('#showroom').scrollIntoView({behavior:'smooth'});
renderProducts();updateCart();
