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

const cache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });
const rateLimiter = new RateLimiterMemory({ points: 5, duration: 1 });

function getEtsyHeaders(){
  const apiKey = process.env.ETSY_API_KEY || 'mock';
  const sharedSecret = process.env.ETSY_SHARED_SECRET || process.env.ETSY_SECRET || '';
  if(sharedSecret) return { 'x-api-key': `${apiKey}:${sharedSecret}` };
  return { 'x-api-key': apiKey };
}
const etsyClient = () => axios.create({ baseURL: 'https://openapi.etsy.com/v3', headers: getEtsyHeaders(), timeout: 20000 });
const isMockMode = () => !process.env.ETSY_API_KEY || process.env.ETSY_API_KEY.length < 10;
function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0;} return Math.abs(h); }

app.get('/', (req,res)=>{
  res.json({ name:'Hamza Tutar Kusursuz v13', version:'v13-kusursuz-gercek-alakali', mock_mode:isMockMode(), status:'online', timestamp:new Date().toISOString() });
});
app.get('/health', (req,res)=>{
  const headers = getEtsyHeaders();
  res.json({ status:'ok', mock_mode:isMockMode(), version:'v13-kusursuz-gercek', x_api_key_format: headers['x-api-key'].includes(':') ? 'key:secret CORRECT' : 'key only', etsy_key_present:!isMockMode(), timestamp:new Date().toISOString() });
});

// KUSURSUZ ETIKET ALAKA SKORU
function calculateTagRelevance(tag, keyword){
  const kwWords = keyword.toLowerCase().split(/\s+/).filter(w=>w.length>=2);
  const tagLower = tag.toLowerCase();
  const tagWords = tagLower.split(/\s+/);
  
  let score = 0;
  // 1. Tam keyword içeriyor mu? En yüksek
  if(tagLower.includes(keyword.toLowerCase())) score += 100;
  // 2. Keyword kelimelerini içeriyor mu?
  kwWords.forEach(kw => {
    if(tagLower.includes(kw)) score += 25;
  });
  // 3. Tişört niş kelimeleri? (mama, bear, mom, dog, etc)
  const nicheWords = ['mama','bear','mom','dog','custom','personalized','funny','gift','family','bachelorette','birthday','matching'];
  nicheWords.forEach(nw => {
    if(tagLower.includes(nw) && kwWords.includes(nw)) score += 15;
  });
  // 4. Generic çok genel mi? Ceza
  const genericOnly = ['gift for her','custom gift','personalized gift','gift','shirt','tee'];
  if(genericOnly.includes(tagLower)) score -= 50;
  // 5. Tekrarlı mı? mama shirt shirt gibi?
  if(tagLower.split(' ').filter((w,i,arr)=>arr.indexOf(w)!==i).length>0) score -= 30;
  
  return score;
}

async function handleKusursuz(req,res){
  const { keyword } = req.query;
  if(!keyword) return res.status(400).json({error:'keyword gerekli'});
  const cleanKeyword = keyword.toLowerCase().trim();
  const cacheKey = `kusursuz-v13:${cleanKeyword}`;
  if(req.query.nocache!=='1'){
    const cached = cache.get(cacheKey);
    if(cached) return res.json({...cached, cached:true});
  }

  let listings=[]; let realData=false; let errorLog=[]; let totalCount=0;
  const headers = getEtsyHeaders();
  errorLog.push(`x-api-key: ${headers['x-api-key'].includes(':')?'key:secret CORRECT':'key only'}`);
  
  if(!isMockMode()){
    try{
      await rateLimiter.consume('etsy',1);
      const client = etsyClient();
      const r = await client.get('/application/listings/active', { params:{ keywords: keyword, limit:100, sort_on:'score', sort_order:'desc' } });
      listings = r.data.results||[];
      totalCount = r.data.count||0;
      realData = listings.length>0;
      errorLog.push(`SUCCESS: ${listings.length} gerçek Etsy listesi - keyword: ${keyword}`);
    }catch(e){
      errorLog.push(`active FAILED: ${e.response?.status} - ${JSON.stringify(e.response?.data||e.message).slice(0,300)}`);
      try{
        await rateLimiter.consume('etsy',1);
        const client = etsyClient();
        const r2 = await client.get('/application/listings/trending', { params:{ limit:100 } });
        const all = r2.data.results||[];
        const firstWord = cleanKeyword.split(' ')[0];
        const filtered = all.filter(l=> (l.title||'').toLowerCase().includes(firstWord));
        listings = filtered.length>=5 ? filtered.slice(0,60) : all.slice(0,60);
        totalCount = all.length*50;
        realData = listings.length>0;
        errorLog.push(`trending fallback SUCCESS: ${listings.length} liste`);
      }catch(e2){
        errorLog.push(`trending FAILED: ${e2.response?.status}`);
      }
    }
  } else {
    errorLog.push('MOCK MODE');
  }

  // MOCK ise bile alakalı mock üret - kusursuz
  if(listings.length===0){
    const h = hashCode(cleanKeyword);
    totalCount = 15000 + (h%85000);
    const kw = cleanKeyword;
    // Alakalı mock - keyword'e göre
    const isMamaBear = kw.includes('mama bear') || kw.includes('bear mama');
    const isDogMom = kw.includes('dog mom') || kw.includes('dog mama');
    const isMama = kw.includes('mama') || kw.includes('mom');
    
    let mockTags = [];
    if(isMamaBear){
      mockTags = ['mama bear shirt','mama bear tee','bear mama shirt','custom mama bear shirt','mama bear gift','funny mama bear','mama bear matching','mama bear family','personalized mama bear','mama bear birthday','mama bear christmas','mama bear mama','mama bear mama shirt'];
    } else if(isDogMom){
      mockTags = ['dog mom shirt','custom dog mom shirt','funny dog mom shirt','dog mama shirt','dog mom gift','personalized dog mom','dog mom life','dog mom tee','dog lover mom shirt','dog mom birthday','dog mom funny','custom pet mom shirt','dog mom matching'];
    } else if(isMama){
      mockTags = ['mama bear shirt','custom mama shirt','funny mama shirt','mama life shirt','personalized mama shirt','mama shirt gift','mama shirt funny','mama shirt vintage','matching mama shirt','mama shirt trendy','mama shirt aesthetic','mama mama shirt','mama shirt oversized'];
    } else {
      mockTags = [`${kw} shirt`,`custom ${kw} shirt`,`funny ${kw} shirt`,`${kw} gift`,`personalized ${kw}`,`${kw} tee`,`${kw} matching`,`${kw} family`,`${kw} birthday`,`${kw} vintage`,`${kw} trendy`,`${kw} custom`,`${kw} funny`];
    }
    listings = Array.from({length:20}, (_,i)=>({
      title: `${kw} - ${mockTags[i%mockTags.length]} - Gift for Her`,
      tags: mockTags.slice(i, i+5),
      num_favorers: 500 + (h+i*37)%3500,
      price: { amount: 2200 + (i*100)%1800 }
    }));
    errorLog.push(`Perfect curated mock - keyword alakalı: ${kw} - 20 liste`);
  }

  // FİLTRELE: Sadece keyword ile alakalı listingleri al (başlıkta keyword kelimesi var mı?)
  const kwWords = cleanKeyword.split(/\s+/).filter(w=>w.length>=2);
  let relevantListings = listings.filter(l=>{
    const title = (l.title||'').toLowerCase();
    return kwWords.some(kw=> title.includes(kw));
  });
  if(relevantListings.length < 10) relevantListings = listings; // Çok azsa hepsini al
  errorLog.push(`Alakalı filtre: ${listings.length} -> ${relevantListings.length} liste (keyword kelimeleri başlıkta)`);

  // TAG ANALIZI - KUSURSUZ ALAKALI
  const tagFreq = {};
  const tagRelevance = {};
  relevantListings.forEach(l=>{
    (l.tags||[]).forEach(rawTag=>{
      let tag = rawTag.toLowerCase().trim();
      if(tag.length<2) return;
      // Temizle: shirt shirt -> shirt
      tag = tag.replace(/\b(\w+)\s+\1\b/g, '$1');
      tag = tag.replace(/\s+/g,' ').trim();
      if(tag.length<2) return;
      // Generic çok genel mi? Atla eğer tek kelime generic ise
      if(['gift','shirt','tee','custom'].includes(tag)) return;
      
      tagFreq[tag] = (tagFreq[tag]||0)+1;
      if(!tagRelevance[tag]) tagRelevance[tag] = calculateTagRelevance(tag, cleanKeyword);
    });
  });

  // ELITE 13 - ALAKA + FREKANS + CESITLILIK
  let eliteCandidates = Object.entries(tagFreq).map(([tag,freq])=>({
    tag,
    frequency: freq,
    relevance: tagRelevance[tag]||0,
    usage_percent: Math.round((freq/relevantListings.length)*100),
    score: (tagRelevance[tag]||0)*2 + freq*3 // Alaka x2 + frekans x3
  }));
  
  // Sırala: score yüksek olan önce
  eliteCandidates.sort((a,b)=> b.score - a.score);
  
  // Çeşitlilik: Aynı kelimeleri içerenleri filtrele - %70 benzerlik varsa sadece yüksek skorlu kalsın
  const diverseElite = [];
  for(let cand of eliteCandidates){
    const isSimilar = diverseElite.some(existing=>{
      const aWords = new Set(cand.tag.split(' '));
      const bWords = new Set(existing.tag.split(' '));
      const intersection = [...aWords].filter(w=>bWords.has(w)).length;
      const union = new Set([...aWords, ...bWords]).size;
      const similarity = union===0 ? 0 : intersection/union;
      return similarity > 0.7; // %70 benzer
    });
    if(!isSimilar){
      diverseElite.push(cand);
    }
    if(diverseElite.length>=25) break; // 25 aday, sonra 13 seç
  }

  const elite13 = diverseElite.slice(0,13);
  const topTags = diverseElite.slice(0,25);

  // STATS
  const totalFav = relevantListings.reduce((s,l)=>s+(l.num_favorers||0),0);
  const salesList = relevantListings.map(l=> Math.round((l.num_favorers||0)*0.25));
  const totalSales = salesList.reduce((a,b)=>a+b,0);
  const prices = relevantListings.map(l=> (l.price?.amount||2500)/100).filter(p=>p>0);
  const avgPrice = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : 26;
  const medianPrice = prices.length ? [...prices].sort((a,b)=>a-b)[Math.floor(prices.length/2)] : 26;
  const searchVol = Math.round(totalFav*0.8 + totalCount*0.01);
  const compScore = Math.min(95, Math.round((totalCount/1000)*10 + relevantListings.length));
  const liveScore = Math.round((Math.min(100, searchVol/200) + (100-compScore) + Math.min(100, totalSales/50))/3);
  let liveLabel = 'DÜŞÜK'; let liveColor='red';
  if(liveScore>=75){ liveLabel='ÇOK YÜKSEK FIRSAT'; liveColor='emerald'; }
  else if(liveScore>=60){ liveLabel='YÜKSEK FIRSAT'; liveColor='green'; }
  else if(liveScore>=45){ liveLabel='İYİ FIRSAT'; liveColor='yellow'; }

  const commonWords = {};
  relevantListings.slice(0,20).forEach(l=>{
    (l.title||'').toLowerCase().split(/[^a-z]+/).forEach(w=>{
      if(w.length<3 || ['the','and','for','with','custom'].includes(w)) return;
      commonWords[w]=(commonWords[w]||0)+1;
    });
  });
  const topWords = Object.entries(commonWords).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([w])=>w);

  const title1 = `${keyword.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')} | ${topWords.slice(0,2).join(' ')} Gift | Custom Shirt`;
  const title2 = `Custom ${keyword} - Funny ${topWords[0]||'Mama Bear'} | Personalized Gift`;
  const title3 = `Personalized ${keyword} | ${topWords.slice(0,3).join(' ')} | Family Gift`;

  const competitors = relevantListings.slice(0,5).map((l,i)=>({
    rank:i+1, title:l.title, price:`$${((l.price?.amount||2500)/100).toFixed(2)}`, favorers:l.num_favorers, est_sales:salesList[i], tags:l.tags?.slice(0,5)
  }));

  const result={
    keyword,
    real_data: realData,
    mock: !realData,
    error_log: errorLog,
    is_kusursuz: true,
    alaka: `${relevantListings.length} liste keyword ile alakalı`,
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
      median_price: medianPrice,
      listings_analyzed: relevantListings.length,
      total_listings_found: listings.length
    },
    price_analysis:{
      avg:`$${avgPrice.toFixed(2)}`,
      median:`$${medianPrice.toFixed(2)}`,
      sweet_spot: `$${Math.round(medianPrice-2)}-$${Math.round(medianPrice+4)}`,
      recommendation: `En çok satanlar $${Math.round(medianPrice-2)}-$${Math.round(medianPrice+4)} arasında`
    },
    titles:{ seo_title_1:title1, seo_title_2:title2, seo_title_3:title3 },
    top_tags: topTags,
    elite_13: elite13.map(t=>t.tag),
    elite_detailed: elite13,
    competitors,
    generated_at: new Date().toISOString()
  };

  cache.set(cacheKey, result, 1800);
  res.json(result);
}

app.get('/api/keyword/ultimate', handleKusursuz);
app.get('/api/keyword/full-research', handleKusursuz);
app.get('/api/keyword/analyze', handleKusursuz);
app.get('/api/trending/daily', async (req,res)=>{
  res.json({ message:'use ultimate' });
});

app.listen(PORT, ()=>console.log(`🚀 KUSURSUZ v13 GERCEK ALAKALI: ${PORT}`));
                  
