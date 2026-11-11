// Immutable, index-based playback queue changes. Track IDs can repeat by design.
// The current song is preserved; edits affect only Up Next.
export function enqueueNext(queue,index,song) {
  if(!song?.id)return queue;
  if(index<0 || !queue.length)return [song];
  const at=Math.min(index+1,queue.length);
  return [...queue.slice(0,at),song,...queue.slice(at)];
}
export function enqueueLast(queue,index,song){
  if(!song?.id)return queue;
  return [...queue,song];
}
export function reorderUpcoming(queue,index,from,to){
  if(from<=index||to<=index||from<0||to<0||from>=queue.length||to>=queue.length||from===to)return queue;
  const result=[...queue],item=result.splice(from,1)[0];
  result.splice(to,0,item);
  return result;
}
export function removeUpcoming(queue,index,at){
  if(at<=index||at>=queue.length||at<0)return queue;
  return queue.filter((_,i)=>i!==at);
}
export function clearUpcoming(queue,index){
  if(index<0)return [];
  return queue.slice(0,index+1);
}
export function nextQueueIndex(queue,index){
  return index>=0&&index+1<queue.length?index+1:-1;
}
