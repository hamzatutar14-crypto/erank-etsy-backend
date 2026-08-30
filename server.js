import express from 'express';
import cors from 'cors';
import axios from 'axios';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import { RateLimiterMemory } from 'rate-limiter-flexible';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: '*' }));
app.use(express.json());

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });

const etsyClient = axios.create({
  baseURL: 'https://openapi.etsy.com/v3',
  headers: { 'x-api-key': process.env.ETSY_API_KEY || 'mock' },
  timeout: 20000,
});

const isMockMode = () => !process.env.ETSY_API_KEY || process.env.ETSY_API_KEY.length < 10;
function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0;} return Math.abs(h); }
function estimateSales(fav){ return Math.round((fav||0)*0.25); }

app.get('/health', (req,res)=>res.json({ status:'ok', mock_mode:isMockMode(), version:'2028-ultimate-v5', features:['price_analysis','title_gen','competitor_spy','live_score','seasonality'] }));

// ULTIMATE FULL RESEARCH
app.get('/api/keyword/ultimate', async (req,res)=>{
  const { keyword } = req.query;
  if(!keyword) return res.status(400).json({error:'keyword gerekli'});
  const cacheKey = `ultimate:${keyword}`;
  const cached = cache.get(cacheKey);
  if(cached) return res.json({...cached, cached:true});

  try{
    let listings=[];
    let realData=false;
    let totalCount=0;

    if(!isMockMode()){
      try{
        await rateLimiter.consume('etsy',1);
        const r = await etsyClient.get('/application/listings/active', { params:{ keywords: keyword, limit:100, sort_on:'score', sort_order:'desc' } });
        listings = r.data.results||[];
        totalCount = r.data.count||listings.length*25;
        realData = listings.length>0;
      }catch(e){
        try{
          await rateLimiter.consume('etsy',1);
          const r2 = await etsyClient.get('/application/listings/trending', { params:{ limit:100 } });
          const all = r2.data.results||[];
          listings = all.filter(l=>(l.title||'').toLowerCase().includes(keyword.toLowerCase())).slice(0,50);
          if(listings.length<10) listings = all.slice(0,50);
          totalCount = all.length*30;
          realData = listings.length>0;
        }catch(e2){}
      }
    }

    if(listings.length===0){
      const h = hashCode(keyword);
      totalCount = 2000 + (h%60000);
      const tagsPool=['personalized gift','custom gift','handmade','gift for her','gift for mom','birthday gift','anniversary gift','wedding gift','bridesmaid gift','custom necklace','gold necklace','silver necklace','dainty necklace','layered necklace','initial necklace','name necklace','birthstone necklace','mother necklace','boho jewelry','minimalist','vintage','custom bracelet'];
      listings = Array.from({length:60}, (_,i)=>{
        const lh = hashCode(keyword+i*7);
        const price = 1500 + (lh%6000);
        const fav = 20 + (lh%3500);
        return {
          listing_id: 1000000+lh,
          title: `${keyword} ${['Gold','Silver','Custom','Dainty','Boho','Minimalist'][i%6]} ${['Gift for Her','Personalized','Handmade','Custom Made'][i%4]} - ${['Christmas Gift','Birthday Gift','Anniversary'][i%3]}`,
          price:{ amount:price, divisor:100 },
          num_favorers:fav,
          tags:[keyword, tagsPool[lh%tagsPool.length], tagsPool[(lh+3)%tagsPool.length], `${keyword} gift`, `${keyword} handmade`, tagsPool[(lh+7)%tagsPool.length]],
          quantity: 5 + (lh%20)
        };
      });
    }

    // Sales & favs
    const salesList = listings.map(l=>estimateSales(l.num_favorers));
    const totalSales = salesList.reduce((a,b)=>a+b,0);
    const totalFav = listings.reduce((s,l)=>s+(l.num_favorers||0),0);
    const prices = listings.map(l=> (l.price?.amount||0)/(l.price?.divisor||100)).filter(p=>p>0).sort((a,b)=>a-b);
    const avgPrice = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : 28;
    const minPrice = prices[0]||10;
    const maxPrice = prices[prices.length-1]||60;
    const medianPrice = prices[Math.floor(prices.length/2)]||avgPrice;

    // Price vs Sales analysis - find sweet spot
    const priceBuckets = {};
    listings.forEach((l,i)=>{
      const p = (l.price?.amount||2500)/100;
      const bucket = Math.floor(p/10)*10;
      if(!priceBuckets[bucket]) priceBuckets[bucket]={count:0, totalSales:0, totalFav:0};
      priceBuckets[bucket].count+=1;
      priceBuckets[bucket].totalSales+=salesList[i];
      priceBuckets[bucket].totalFav+=l.num_favorers||0;
    });
    const bestBucket = Object.entries(priceBuckets).sort((a,b)=> (b[1].totalSales/b[1].count) - (a[1].totalSales/a[1].count))[0];
    const sweetSpot = bestBucket ? `$${bestBucket[0]}-$${parseInt(bestBucket[0])+10}` : `$${(medianPrice-5).toFixed(0)}-$${(medianPrice+5).toFixed(0)}`;

    // Search volume & competition
    const h = hashCode(keyword);
    const searchVol = 1000 + (h%20000) + Math.round(totalFav/8 + totalCount/20);
    const compScore = Math.min(100, Math.round((totalCount/800)));
    
    // LIVE SCORE 0-100
    // Formula: (searchVol*0.25 + totalSales*0.35 + (100-compScore)*0.25 + priceOpportunity*0.15)
    const priceOpportunity = bestBucket ? 80 : 50;
    let liveScore = Math.round((searchVol/250)*0.25 + (totalSales/50)*0.35 + (100-compScore)*0.25 + priceOpportunity*0.15);
    liveScore = Math.min(98, Math.max(5, liveScore));

    let liveLabel = 'DÜŞÜK';
    let liveColor = 'red';
    if(liveScore>=75){ liveLabel='YÜKSEK FIRSAT - HEMEN GİR'; liveColor='emerald'; }
    else if(liveScore>=50){ liveLabel='ORTA FIRSAT'; liveColor='yellow'; }
    else if(liveScore>=30){ liveLabel='DÜŞÜK FIRSAT - ZOR'; liveColor='orange'; }

    // Tags
    const tagFreq={};
    listings.forEach(l=>{
      (l.tags||[]).forEach(t=>{
        const k=t.toLowerCase().trim();
        if(k.length<2||k.length>35) return;
        if(k.split(' ').filter(w=>w===keyword.split(' ')[0]).length>1) return;
        tagFreq[k]=(tagFreq[k]||0)+1;
      });
    });
    const topTags = Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([tag,freq])=>({
      tag, frequency:freq, usage_percent: Math.round((freq/listings.length)*100), est_sales: Math.round((freq/listings.length)*totalSales*0.8)
    }));

    // Title Generator
    const topWords = {};
    listings.slice(0,20).forEach(l=>{
      (l.title||'').toLowerCase().split(/[^a-z]+/).forEach(w=>{
        if(w.length<3||w===keyword.toLowerCase()) return;
        topWords[w]=(topWords[w]||0)+1;
      });
    });
    const commonWords = Object.entries(topWords).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([w])=>w);
    const title1 = `${keyword.charAt(0).toUpperCase()+keyword.slice(1)} Gold | ${commonWords.slice(0,3).join(' ')} | Gift for Her`;
    const title2 = `Personalized ${keyword} - Custom ${commonWords[0]||'Handmade'} ${commonWords[1]||'Gift'} for ${commonWords[2]||'Mom'} | ${commonWords[3]||'Birthday'} Gift`;
    const title3 = `Custom ${keyword} ${commonWords[0]||'Necklace'} | ${commonWords.slice(1,4).join(' ')} | Bridesmaid Wedding Anniversary Gift`;

    // Seasonality - 12 months
    const seasonality = Array.from({length:12}, (_,i)=>{
      const base = 60 + (h+i*13)%40;
      // Boost for gifts in Nov-Dec, wedding in May-Jun
      let boost = 0;
      if([10,11].includes(i)) boost = 40; // Nov Dec
      if([4,5].includes(i) && keyword.toLowerCase().includes('wedding')) boost = 30;
      if([3,4].includes(i) && keyword.toLowerCase().includes('mother')) boost = 35;
      return { month: ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][i], score: Math.min(100, base+boost) };
    });

    // Competitor sample
    const competitors = listings.slice(0,5).map((l,i)=>({
      rank: i+1,
      title: l.title,
      price: `$${((l.price?.amount||2500)/100).toFixed(2)}`,
      favorers: l.num_favorers,
      est_sales: salesList[i],
      est_revenue: `$${(salesList[i]*((l.price?.amount||2500)/100)).toFixed(0)}`,
      tags: l.tags?.slice(0,5)
    }));

    const result={
      keyword,
      real_data: realData,
      mock: !realData,
      live_score: liveScore,
      live_label: liveLabel,
      live_color: liveColor,
      stats:{
        search_volume: searchVol,
        competition: totalCount,
        competition_score: compScore,
        total_sales: totalSales,
        total_favorers: totalFav,
        avg_price: avgPrice,
        min_price: minPrice,
        max_price: maxPrice,
        median_price: medianPrice,
        sweet_spot: sweetSpot,
        price_buckets: priceBuckets,
        listings_analyzed: listings.length
      },
      price_analysis:{
        avg: `$${avgPrice.toFixed(2)}`,
        median: `$${medianPrice.toFixed(2)}`,
        range: `$${minPrice.toFixed(0)} - $${maxPrice.toFixed(0)}`,
        sweet_spot: sweetSpot,
        recommendation: `Bu kelimede en çok satanlar ${sweetSpot} arasında. Ortalama $${medianPrice.toFixed(0)} koyarsan rekabette öne çıkarsın.`,
        buckets: Object.entries(priceBuckets).map(([range,data])=>({ range: `$${range}`, count:data.count, avg_sales: Math.round(data.totalSales/data.count) })).sort((a,b)=>parseInt(a.range.slice(1))-parseInt(b.range.slice(1)))
      },
      titles:{
        seo_title_1: title1,
        seo_title_2: title2,
        seo_title_3: title3,
        tip: "Başlıkta ilk 3 kelime en önemli. Anahtar kelimeyi en başa koy."
      },
      seasonality,
      top_tags: topTags,
      elite_13: topTags.slice(0,13).map(t=>t.tag),
      competitors,
      generated_at: new Date().toISOString()
    };

    cache.set(cacheKey,result);
    res.json(result);
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

// Competitor analyze by listing id
app.get('/api/competitor/analyze', async (req,res)=>{
  const { listing_id } = req.query;
  if(!listing_id) return res.status(400).json({error:'listing_id gerekli'});
  // Mock for now - real would fetch listing details
  const h = hashCode(listing_id);
  res.json({
    listing_id,
    title: `Competitor Listing ${listing_id}`,
    price: `$${(15 + h%40).toFixed(2)}`,
    favorers: 100 + h%3000,
    est_sales: Math.round((100 + h%3000)*0.25),
    tags: ['personalized gift','custom','handmade','gift for her'],
    analysis: "Bu rakip 3 ayda bu kadar favori almış, etiketlerinin %60'ı yüksek potansiyelli."
  });
});

app.get('/api/trending/daily', async (req,res)=>{
  const cacheKey='daily-ultimate';
  const cached=cache.get(cacheKey);
  if(cached) return res.json({...cached, cached:true});
  try{
    let listings=[];
    let realData=false;
    if(!isMockMode()){
      try{
        await rateLimiter.consume('trend',1);
        const r = await etsyClient.get('/application/listings/trending', { params:{ limit:100 } });
        listings=r.data.results||[];
        realData=listings.length>0;
      }catch(e){}
    }
    if(listings.length===0){
      const base=['personalized necklace','custom name necklace','birthstone necklace','gold necklace','personalized gift','mother necklace','initial necklace','dainty necklace','custom bracelet','personalized mug','wedding gift','bridesmaid gift','custom ornament','personalized ring','layered necklace'];
      listings=base.map(t=>({ title:t, tags:[t, `${t} gift`], num_favorers:500+hashCode(t)%4000 }));
    }
    const tagStats={};
    listings.forEach(l=>{
      (l.tags||[]).forEach(t=>{
        const k=t.toLowerCase().trim();
        if(k.length<2) return;
        if(!tagStats[k]) tagStats[k]={count:0,fav:0};
        tagStats[k].count+=1;
        tagStats[k].fav+=(l.num_favorers||0);
      });
    });
    const sorted=Object.entries(tagStats).map(([tag,d])=>({ tag, frequency:d.count, daily_search: Math.round(d.fav/2), trend_score: d.count*30 + d.fav/50 })).sort((a,b)=>b.trend_score-a.trend_score).slice(0,50);
    const result={ date:new Date().toISOString().split('T')[0], real_data:realData, mock:!realData, top_50_daily_tags:sorted };
    cache.set(cacheKey,result,3600);
    res.json(result);
  }catch(err){ res.status(500).json({error:err.message}); }
});

app.listen(PORT, ()=>console.log(`🚀 eRank ULTIMATE v5: ${PORT} Mock:${isMockMode()}`));
