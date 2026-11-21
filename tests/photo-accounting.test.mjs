import test from 'node:test';
import assert from 'node:assert/strict';
import { photoOutcome, mergeRecoveryResults, resultPhotoIndex, resultKey } from '../lib/photo-accounting.ts';
test('first and last photo retain one-based source identity', () => {
  assert.equal(resultPhotoIndex('photo_001.jpg', 100), 0);
  assert.equal(resultPhotoIndex('photo_100.jpg', 100), 99);
  assert.equal(resultPhotoIndex('photo_000.jpg', 100), null);
});
test('missing/failed photos are never reported as recognized', () => {
  assert.equal(photoOutcome([]), 'Failed / missing');
  assert.equal(photoOutcome([{photo:'photo_001.jpg',notes:'Processing failed'}]), 'Failed / missing');
  assert.equal(photoOutcome([{photo:'photo_001.jpg',description:'bit'}]), 'Needs retake / review');
  assert.equal(photoOutcome([{photo:'photo_001.jpg',customer_part_number:'0001'}]), 'Ready to review');
});
test('retry preserves employee corrections and excludes only the removed item', () => {
  const a = {photo:'photo_001.jpg',part_number:'00123',description:'bit'};
  const b = {photo:'photo_001.jpg',part_number:'00456',description:'bolt'};
  const corrected = {...a,part_number:'00124',is_confirmed:true};
  assert.deepEqual(mergeRecoveryResults([a,b],[corrected,b],[resultKey(b)]),[corrected]);
});

test('an edited nut follows its own label when the washer is returned first', () => {
  const nut = {photo:'photo_007.jpg', source_row_id:'nut', description:'nut'};
  const washer = {photo:nut.photo, source_row_id:'washer', description:'washer'};
  const corrected = {...nut, part_number:'0007-01', was_edited:true};
  assert.deepEqual(mergeRecoveryResults([washer,nut],[corrected,washer],[]), [washer,corrected]);
  assert.deepEqual(mergeRecoveryResults([washer,nut],[corrected],[resultKey(washer)]), [corrected]);
  const similar = {...nut, source_row_id:undefined};
  assert.throws(() => mergeRecoveryResults([similar,similar],[{...similar,was_edited:true}],[]), /single label/);
});
