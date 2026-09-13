import test from 'node:test';
import assert from 'node:assert/strict';
import {Admission, parseInvitation, invitationHash, validPosition, validRoster} from '../src/network/protocol.ts';

test('pending handshakes reserve all three guest slots; reconnect reuses a slot', () => {
  const admission = new Admission();
  assert.deepEqual(['a','b','c','d'].map(id => admission.reserve(id)), [1,2,3,null]);
  assert.equal(admission.reserve('b'), 2);
  admission.release('b');
  assert.equal(admission.reserve('d'), 2);
});
test('reject network positions and rosters that could break rendering or exceed room limits', () => {
  assert.equal(validPosition({x:NaN,y:.5,seq:1}),false);
  assert.equal(validPosition({x:1.1,y:.5,seq:1}),false);
  assert.equal(validPosition({x:.2,y:.5,seq:Infinity}),false);
  const player={id:'traveller-1',name:'Путник',slot:0,x:.2,y:.5,seq:1};
  assert.equal(validRoster([player]),true);
  assert.equal(validRoster([player,{...player,slot:1}]),false);
  assert.equal(validRoster([player,{...player,id:'traveller-2'}]),false);
  assert.equal(validRoster(Array.from({length:5},(_,slot)=>({...player,id:`traveller-${slot}`,slot}))),false);
});
test('one invitation round-trips; incomplete and malformed invitations cannot autojoin', () => {
  const invitation={room:'room-0123456789012345',host:'host-0123456789',key:'secret-01234567890123456789012345'};
  assert.deepEqual(parseInvitation('#'+invitationHash(invitation)),invitation);
  assert.equal(parseInvitation('#room=test'),null);
  assert.equal(parseInvitation('#'+invitationHash({...invitation,host:'<script>'})),null);
});

test('six-person showcase validates pose and reserves only five guest slots', () => {
  const admission=new Admission(6);
  assert.deepEqual(['a','b','c','d','e','f'].map(id=>admission.reserve(id)),[1,2,3,4,5,null]);
  const pose={x:.2,y:.4,seq:1,heading:359,speed:15,running:true};
  assert.equal(validPosition(pose),true);
  for(const invalid of [{heading:NaN},{heading:400},{speed:-1},{speed:Infinity},{running:'yes'}])assert.equal(validPosition({...pose,...invalid}),false);
  const roster=Array.from({length:6},(_,slot)=>({...pose,id:`traveller-${slot}`,name:'Следопыт',slot}));
  assert.equal(validRoster(roster,6),true);
  assert.equal(validRoster(roster),false);
  assert.equal(validRoster([...roster,{...roster[0],id:'traveller-7',slot:6}],6),false);
});
