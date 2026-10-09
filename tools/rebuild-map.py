import argparse, sys, json, math, xml.etree.ElementTree as E
from pathlib import Path
import zipfile
import runpy
from pyproj import Transformer
from shapely.geometry import Polygon,box,LineString
from shapely.ops import transform,unary_union
ROOT=str(Path(__file__).resolve().parent.parent)+'/'
directed_road=runpy.run_path(str(Path(__file__).with_name('osm-direction.py')))['directed_road']
parser=argparse.ArgumentParser(description='Transform locally downloaded Catastro/OSM originals; never publish the original Catastro archive.')
parser.add_argument('--catastro',required=True,help='Original ZIP outside the public repository')
parser.add_argument('--osm',required=True,help='Locally downloaded OSM XML')
parser.add_argument('--bounds',help='JSON list of [x0,x1,z0,z1] rectangles; default: bounds of web/world.json')
args=parser.parse_args()
height_policy=json.loads((Path(ROOT)/'source-data/height-policy.json').read_text())
LAT,LON=36.4195,-6.1485
SX=111320*math.cos(math.radians(LAT));SZ=111320
RECTS=json.loads(args.bounds) if args.bounds else json.loads((Path(ROOT)/'web/world.json').read_text())['bounds']
# The union dissolves shared edges: roads and buildings across a seam are not split.
bounds=unary_union([box(x0,z0,x1,z1) for x0,x1,z0,z1 in RECTS])
def lonlat(x,z):return LON+x/SX,LAT-z/SZ
# Fast Catastro filter: envelope of the rectangles plus 0.001 degrees.
FX0,FZ0,FX1,FZ1=bounds.bounds;(LON0,LAT1),(LON1,LAT0)=lonlat(FX0,FZ0),lonlat(FX1,FZ1)
def proj(lon,lat):return ((lon-LON)*SX,(LAT-lat)*SZ)
def rounded(p):return [round(p[0],2),round(p[1],2)]
r=E.parse(args.osm).getroot();nodes={n.attrib['id']:proj(float(n.attrib['lon']),float(n.attrib['lat'])) for n in r.findall('node')}
data={'origin':[LON,LAT],'bounds':RECTS,'roads':[],'areas':[],'landmarks':[],'trees':[],'buildings':[]}
for n in r.findall('node'):
 t={v.attrib['k']:v.attrib['v'] for v in n.findall('tag')};p=nodes[n.attrib['id']]
 if t.get('natural')=='tree' and bounds.contains(__import__('shapely').geometry.Point(p)):data['trees'].append(rounded(p))
for w in r.findall('way'):
 t={v.attrib['k']:v.attrib['v'] for v in w.findall('tag')};ids=[k.attrib['ref'] for k in w.findall('nd') if k.attrib['ref'] in nodes];p=[nodes[i] for i in ids]
 if len(p)<2:continue
 if not LineString(p).intersects(bounds):continue
 if 'highway' in t and t['highway'] not in ['proposed','construction','steps']:
  if t.get('area')=='yes':
   if len(p)>3:data['areas'].append({'id':w.attrib['id'],'kind':'square','p':[rounded(v) for v in p]})
  else:
   kind=t['highway'];width={'primary':9,'secondary':8,'tertiary':7,'residential':5.5,'service':4,'unclassified':6,'living_street':5,'pedestrian':5,'footway':2,'path':2,'cycleway':2.2}.get(kind,5)
   try:width=float(t.get('width',width))
   except:pass
   road_points,oneway=directed_road(p,t)
   parts=bounds.intersection(LineString(road_points));parts=list(getattr(parts,'geoms',[parts]))
   for part in parts:
    if part.geom_type=='LineString' and part.length>1:data['roads'].append({'id':w.attrib['id'],'name':t.get('name',''),'type':kind,'w':width,'oneway':oneway,'bridge':t.get('bridge')=='yes','p':[rounded(v) for v in part.coords]})
 if p[0]==p[-1] and len(p)>3:
  kind='water' if t.get('natural')=='water' or t.get('water') else 'park' if t.get('leisure') in ['park','garden'] or t.get('landuse') in ['grass','forest'] else None
  if kind:data['areas'].append({'id':w.attrib['id'],'kind':kind,'p':[rounded(v) for v in p]})
 if 'building'in t and 'name'in t:
  poly=Polygon(p)
  c=poly.centroid
  if bounds.contains(c):data['landmarks'].append({'name':t['name'],'p':rounded([c.x,c.y]),'outline':[rounded(v) for v in p]})
# Reconstruct real construction volumes from official floor-count and footprint data.
tr=Transformer.from_crs(25829,4326,always_xy=True)
def local(x,y,z=None):
 lon,lat=tr.transform(x,y)
 try:return [(v-LON)*SX for v in lon],[(LAT-v)*SZ for v in lat]
 except:return proj(lon,lat)
ns={'g':'http://www.opengis.net/gml/3.2','b':'http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0'}
features=0
archive=zipfile.ZipFile(args.catastro)
source=archive.open('A.ES.SDGC.BU.11015.buildingpart.gml')
for event,e in E.iterparse(source,events=['end']):
 if e.tag!='{'+ns['b']+'}BuildingPart':continue
 floors=int(e.findtext('b:numberOfFloorsAboveGround','1',ns) or 1)
 if floors<1:e.clear();continue
 for patch in e.findall('.//g:PolygonPatch',ns):
  rings=[]
  for elem in [patch.find('g:exterior',ns),*patch.findall('g:interior',ns)]:
   if elem is None:continue
   pos=elem.find('.//g:posList',ns)
   if pos is None:continue
   v=list(map(float,pos.text.split()));rings.append(list(zip(v[::2],v[1::2])))
  if not rings:continue
  # Fast bbox before full transformation.
  lon,lat=tr.transform(*rings[0][0])
  if not (LON0-.001<lon<LON1+.001 and LAT0-.001<lat<LAT1+.001):continue
  poly=transform(local,Polygon(rings[0],rings[1:]))
  if not poly.is_valid:poly=poly.buffer(0)
  poly=poly.intersection(bounds).simplify(.12,preserve_topology=True)
  parts=list(getattr(poly,'geoms',[poly]))
  for part in parts:
   if part.geom_type!='Polygon' or part.area<1.5:continue
   data['buildings'].append({'p':[rounded(v) for v in list(part.exterior.coords)[:-1]],'holes':[[rounded(v) for v in list(r.coords)[:-1]] for r in part.interiors],'h':round(floors*height_policy['floorHeight']+height_policy['baseOffset'],2),'floors':floors})
  features+=1
 e.clear()
# El texto del relieve lo mantiene world.json; aquí no se reconstruye el terreno.
data['meta']={'roads':'© OpenStreetMap contributors — ODbL 1.0','buildings':'Volúmenes de juego transformados a partir de D.G. del Catastro, INSPIRE BU, descarga 2026-10-04. Alturas estimadas: plantas × 3,05 m + 0,4 m; piloto con alturas IGN/PNOA-LiDAR (height-samples.json).','aerial':'Obra derivada de PNOA 2022-07 © IGN / PNOA / SCNE — CC BY 4.0','date':'2026-10-04','terrain':json.loads((Path(ROOT)/'web/world.json').read_text())['meta']['terrain']}
with open(ROOT+'rebuilt-city.json','w')as f:json.dump(data,f,ensure_ascii=False,separators=(',',':'))
print(json.dumps({'roads':len(data['roads']),'named_streets':len(set(r['name'] for r in data['roads'] if r['name'])),'buildings':len(data['buildings']),'areas':len(data['areas']),'bounds':data['bounds'],'landmarks':data['landmarks'][:2]},ensure_ascii=False))
