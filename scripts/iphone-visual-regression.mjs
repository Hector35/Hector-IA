import pixelmatch from 'pixelmatch';
import {PNG} from 'pngjs';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const baselineDir=process.env.VISUAL_BASELINE_DIR||'visual-baseline';
const currentDir=process.env.VISUAL_CURRENT_DIR||'visual-current';
const outputDir=process.env.VISUAL_DIFF_DIR||'visual-diff';
const maxChangedRatio=Number(process.env.VISUAL_MAX_CHANGED_RATIO||'0.02');
const maxChangedPixels=Number(process.env.VISUAL_MAX_CHANGED_PIXELS||'12000');
const pixelThreshold=Number(process.env.VISUAL_PIXEL_THRESHOLD||'0.12');

await mkdir(outputDir,{recursive:true});
const currentFiles=(await readdir(currentDir)).filter(file=>file.endsWith('.png')&&!file.endsWith('-fatal.png')).sort();
const baselineFiles=new Set((await readdir(baselineDir)).filter(file=>file.endsWith('.png')&&!file.endsWith('-fatal.png')));
const report={
 baselineDir,currentDir,outputDir,
 thresholds:{maxChangedRatio,maxChangedPixels,pixelThreshold},
 comparedAt:new Date().toISOString(),
 comparisons:[],
 summary:{passed:true,compared:0,failed:0,missing:0}
};

for(const file of currentFiles){
 const currentPath=path.join(currentDir,file),baselinePath=path.join(baselineDir,file),diffPath=path.join(outputDir,file.replace(/\.png$/,'.diff.png'));
 if(!baselineFiles.has(file)){
  report.comparisons.push({file,passed:false,reason:'captura base ausente'});
  report.summary.passed=false;report.summary.failed+=1;report.summary.missing+=1;
  continue;
 }
 const [baselineBuffer,currentBuffer]=await Promise.all([readFile(baselinePath),readFile(currentPath)]);
 const baseline=PNG.sync.read(baselineBuffer),current=PNG.sync.read(currentBuffer);
 if(baseline.width!==current.width||baseline.height!==current.height){
  report.comparisons.push({file,passed:false,reason:'dimensiones distintas',baseline:{width:baseline.width,height:baseline.height},current:{width:current.width,height:current.height}});
  report.summary.passed=false;report.summary.failed+=1;
  continue;
 }
 const diff=new PNG({width:current.width,height:current.height});
 const changedPixels=pixelmatch(baseline.data,current.data,diff.data,current.width,current.height,{threshold:pixelThreshold,includeAA:false,alpha:0.55,diffColor:[255,0,80],aaColor:[255,190,0]});
 const totalPixels=current.width*current.height,changedRatio=changedPixels/totalPixels;
 const passed=changedPixels<=maxChangedPixels&&changedRatio<=maxChangedRatio;
 await writeFile(diffPath,PNG.sync.write(diff));
 report.comparisons.push({file,passed,changedPixels,totalPixels,changedRatio:Number(changedRatio.toFixed(6)),diff:diffPath});
 report.summary.compared+=1;
 if(!passed){report.summary.passed=false;report.summary.failed+=1;}
}

for(const file of baselineFiles){
 if(!currentFiles.includes(file)){
  report.comparisons.push({file,passed:false,reason:'captura actual ausente'});
  report.summary.passed=false;report.summary.failed+=1;report.summary.missing+=1;
 }
}

await writeFile(path.join(outputDir,'regression-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.summary.passed)process.exitCode=1;
