const assert=require('node:assert/strict');
const {randomUUID,randomInt}=require('node:crypto');
const {createRequire}=require('node:module');
const path=require('node:path');
const load=createRequire(path.resolve(__dirname,'../backend/stoq-auth-service/package.json'));
const {PrismaService}=load('./dist/prisma/prisma.service.js');
const {AuthService}=load('./dist/auth/auth.service.js');
const {JwtService}=load('@nestjs/jwt');
const {ConfigService}=load('@nestjs/config');
const bcrypt=load('bcrypt');
async function main(){
 assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/ci_[a-zA-Z0-9_]+$/,'Only isolated CI database');
 const prisma=new PrismaService();
 const auth=new AuthService(new JwtService(),new ConfigService(),prisma);
 const marker=randomUUID(),telegramUserId=String(randomInt(1000000000000,2000000000000));
 const restaurants=[];let user;
 try{
  for(let i=0;i<2;i++)restaurants.push(await prisma.restaurant.create({data:{name:`Telegram CI ${marker} ${i}`,address:'Isolated CI'}}));
  user=await prisma.user.create({data:{restaurantId:restaurants[0].id,fullName:'Telegram CI admin',email:`telegram-ci-${marker}@example.invalid`,role:'ADMIN',passwordHash:await bcrypt.hash(marker,4),hashedRefreshToken:'browser-session-sentinel'}});
  const dto={email:user.email,password:marker};
  const first=await auth.telegramLogin(dto,telegramUserId);
  assert.equal((await auth.telegramVerify(first.sessionToken,telegramUserId)).restaurantId,restaurants[0].id);
  assert.equal((await prisma.user.findUnique({where:{id:user.id}})).hashedRefreshToken,'browser-session-sentinel');
  const stored=await prisma.telegramSession.findUnique({where:{telegramUserId}});
  assert.ok(!JSON.stringify(stored).includes(first.sessionToken));
  await assert.rejects(auth.telegramVerify(first.sessionToken,String(Number(telegramUserId)+1)));
  const second=await auth.telegramLogin(dto,telegramUserId);
  await assert.rejects(auth.telegramVerify(first.sessionToken,telegramUserId));
  await prisma.user.update({where:{id:user.id},data:{blocked:true}});
  await assert.rejects(auth.telegramVerify(second.sessionToken,telegramUserId));
  await prisma.user.update({where:{id:user.id},data:{blocked:false,role:'WAITER'}});
  await assert.rejects(auth.telegramVerify(second.sessionToken,telegramUserId));
  await prisma.user.update({where:{id:user.id},data:{role:'MANAGER',restaurantId:restaurants[1].id}});
  await assert.rejects(auth.telegramVerify(second.sessionToken,telegramUserId));
  await prisma.user.update({where:{id:user.id},data:{restaurantId:restaurants[0].id}});
  await auth.telegramLogout(second.sessionToken,telegramUserId);
  await assert.rejects(auth.telegramVerify(second.sessionToken,telegramUserId));
  assert.equal((await prisma.user.findUnique({where:{id:user.id}})).hashedRefreshToken,'browser-session-sentinel');
  await auth.telegramLogin(dto,telegramUserId);
  await prisma.user.delete({where:{id:user.id}});user=null;
  assert.equal(await prisma.telegramSession.count({where:{telegramUserId}}),0);
  console.log('PASS PostgreSQL Telegram sessions: independent browser state, rotation, identity/role/block/tenant isolation, logout and cascade');
 }finally{
  if(user)await prisma.user.deleteMany({where:{id:user.id}});
  await prisma.restaurant.deleteMany({where:{id:{in:restaurants.map(r=>r.id)}}});
  await prisma.$disconnect();
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
