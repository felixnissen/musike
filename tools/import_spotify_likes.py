import requests, json, re, html, pathlib, time, unicodedata, difflib, concurrent.futures, threading, datetime, argparse
parser=argparse.ArgumentParser(description='Import Spotify track URLs into a local Musike library using conservative title/artist matching.')
parser.add_argument('input',type=pathlib.Path,help='UTF-8 text file containing Spotify track URLs')
parser.add_argument('--server',default='http://127.0.0.1:4280')
parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path.cwd()/'spotify-import-results')
args=parser.parse_args()
ROOT=args.output
ROOT.mkdir(parents=True, exist_ok=True)
INPUT=args.input
BASE=args.server.rstrip('/')
IDS=re.findall(r'open\.spotify\.com/track/([A-Za-z0-9]+)',INPUT.read_text(encoding='utf-8'))
IDS=list(dict.fromkeys(IDS))
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
def save(name,data):
    p=ROOT/name; tmp=p.with_suffix(p.suffix+'.tmp'); tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8'); tmp.replace(p)
def norm(s):
    s=unicodedata.normalize('NFKD',str(s).casefold())
    s=''.join(c for c in s if not unicodedata.combining(c))
    s=re.sub(r'\s*[\(\[]\s*(?:remaster(?:ed)?|explicit|radio edit|official|lyrics?).*?[\)\]]','',s)
    return re.sub(r'[^a-z0-9]+',' ',s).strip()
def sim(a,b): return difflib.SequenceMatcher(None,norm(a),norm(b)).ratio()
def spotify(id):
    for tries in range(3):
        try:
            s=requests.get(f'https://open.spotify.com/embed/track/{id}', timeout=18,headers={'User-Agent':'Mozilla/5.0'}).text
            m=re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',s)
            if not m: raise ValueError('No Spotify metadata')
            e=json.loads(m.group(1))['props']['pageProps']['state']['data']['entity']
            return {'id':id,'title':e['name'],'artists':[a['name'] for a in e['artists']],'duration':round(e.get('duration',0)/1000)}
        except Exception as ex:
            if tries==2:return {'id':id,'error':str(ex)}
            time.sleep(2*(tries+1))
def search(item):
    if 'error' in item:return {'spotify':item,'error':'Spotify metadata unavailable'}
    q=item['title']+' '+item['artists'][0]
    for tries in range(3):
        try:
            data=requests.get(BASE+'/api/search',params={'q':q},timeout=30).json()
            tracks=data.get('tracks',[])
            if not tracks: raise ValueError('no tracks')
            ranked=[]
            for t in tracks:
                title=sim(item['title'],t['title'])
                artist=max(sim(a,t.get('artist','')) for a in item['artists'])
                # permit featuring artists in joined YouTube artist field
                if any(norm(a) in norm(t.get('artist','')) for a in item['artists']):artist=max(artist,0.96)
                duration=abs(item['duration']-t.get('duration',0))
                dur=1 if duration<=3 else (0.8 if duration<=8 else (0.3 if duration<=25 else 0))
                score=0.56*title+0.32*artist+0.12*dur
                ranked.append((score,title,artist,duration,t))
            ranked.sort(key=lambda x:x[0],reverse=True)
            best=ranked[0]
            # Title must match and artist must be credible; avoid fake cover/radio edit
            confident=best[0]>=0.81 and best[1]>=0.79 and best[2]>=0.62 and best[3]<=22
            return {'spotify':item,'score':round(best[0],3),'titleScore':round(best[1],3),'artistScore':round(best[2],3),'durationDifference':best[3],'accepted':confident,'match':best[4],'alternatives':[x[4] for x in ranked[1:3]]}
        except Exception as ex:
            if tries==2:return {'spotify':item,'error':str(ex)}
            time.sleep(3*(tries+1))
def main():
    print('START',len(IDS),flush=True)
    original=requests.get(BASE+'/api/library',timeout=15).json()
    save('library-before-'+stamp+'.json',original)
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
        meta=list(pool.map(spotify,IDS))
    save('spotify-metadata.json',meta)
    print('SPOTIFY_META',sum('error' not in x for x in meta),'/',len(meta),flush=True)
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(search,m):m for m in meta}
        for i,f in enumerate(concurrent.futures.as_completed(futures),1):
            try: results.append(f.result())
            except Exception as e:results.append({'spotify':futures[f],'error':str(e)})
            if i%20==0 or i==len(meta):
                save('match-results.json',results)
                print('MATCH_PROGRESS',i,len(meta),'accepted',sum(r.get('accepted',False) for r in results),flush=True)
    order={v:i for i,v in enumerate(IDS)}
    results.sort(key=lambda r:order.get(r['spotify']['id'],999999))
    save('match-results.json',results)
    matches=[r['match'] for r in results if r.get('accepted')]
    seen=set();matches=[t for t in matches if not (t['id'] in seen or seen.add(t['id']))]
    unresolved=[r for r in results if not r.get('accepted')]
    save('needs-review.json',unresolved)
    print('MATCH_DONE',len(matches),'unresolved',len(unresolved),flush=True)
    # Merge only trusted YouTube matches; preserve prior personal library.
    if matches:
        new={'favorites':matches,'playlists':[{'id':'spotify-liked-import','name':'Spotify liked songs (imported)','createdAt':int(time.time()*1000),'updatedAt':int(time.time()*1000),'tracks':matches}],'history':[]}
        response=requests.post(BASE+'/api/library/import',json={'backup':{'format':'musike-backup','version':1,'library':new},'mode':'merge'},timeout=40)
        response.raise_for_status()
        print('IMPORTED',response.json(),flush=True)
    current=requests.get(BASE+'/api/library',timeout=20).json()
    print('VERIFY',len(current.get('favorites',[])),[(p['name'],len(p['tracks'])) for p in current.get('playlists',[])],flush=True)
    save('library-after.json',current)
if __name__=='__main__':main()
