import zipfile,csv,io,json,math
from pathlib import Path
z=zipfile.ZipFile('validation/anthropometry/ANSUR2Distribution.zip');profiles=[];summary=[]
base={'hand_length':190,'hand_breadth':85,'grip_diameter_inside':55,'thumb_length':69,'thumb_breadth':25,'thumb_thickness':22,'finger_lengths':[75,83,73,62],'finger_widths':[22,23,20,18],'finger_thicknesses':[22,20,19,15]}
for sex in ['FEMALE','MALE']:
 name=next(n for n in z.namelist() if n.startswith('Distribution/') and sex+' Public.csv' in n and (sex!='MALE' or 'FEMALE' not in n))
 rows=list(csv.DictReader(io.StringIO(z.read(name).decode('latin1'))));rows.sort(key=lambda r:float(r['handlength']))
 for pct in [1,5,50,95,99]:
  row=rows[math.ceil(len(rows)*pct/100)-1];L=float(row['handlength']);B=float(row['handbreadth']);P=float(row['palmlength']);ls=L/190;ws=B/85
  # Missing digit dimensions are proportional estimates, not ANSUR measurements.
  # Middle-finger length uses hand minus palm length as an approximate proxy.
  fl=(L-P)/83
  h={**base,'hand_length':L,'hand_breadth':B,'thumb_length':69*ls,'thumb_breadth':25*ws,'thumb_thickness':22*ws,'finger_lengths':[v*fl for v in base['finger_lengths']],'finger_widths':[v*ws for v in base['finger_widths']],'finger_thicknesses':[v*ws for v in base['finger_thicknesses']]}
  # Keep the app's existing rough grip estimator as an explicit estimate.
  h['grip_diameter_inside']=(h['thumb_length']+h['finger_lengths'][1]+h['thumb_thickness'])/math.pi
  label=f'{sex.lower()}_P{pct:02}'
  summary.append({'label':label,'n':len(rows),'percentile_dimension':'handlength','hand_length_mm':L,'hand_breadth_mm':B,'measured_palm_length_mm':P,'estimated_grip_mm':h['grip_diameter_inside']})
  for factor in [.85,1,1.15]:
   value={**h,'thumb_thickness':h['thumb_thickness']*factor,'finger_thicknesses':[v*factor for v in h['finger_thicknesses']]}
   profiles.append({'name':label+'_thickness_'+str(factor),'hand':value,'thickness_factor':factor,'observed_dimensions':summary[-1]})
Path('validation/profiles.json').write_text(json.dumps(profiles,indent=2));Path('validation/anthropometry/percentiles.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
