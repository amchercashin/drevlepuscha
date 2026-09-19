import bpy,math
from mathutils import Vector
from prepare import convert

def distance(p,a,b):
    d=b-a;t=max(0,min(1,(p-a).dot(d)/max(1e-10,d.length_squared)));return (p-a-d*t).length

def rig_land(mesh,source_points,guide):
    p=guide['landmarks'];data=bpy.data.armatures.new('LandDeform');arm=bpy.data.objects.new('LandRig',data);bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm;mesh.select_set(False);arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    segments={}
    def add(name,a,b,parent=None):
        bone=data.edit_bones.new(name);bone.head=convert(a,guide);bone.tail=convert(b,guide)
        if parent:bone.parent=data.edit_bones[parent]
        segments[name]=(Vector(a),Vector(b))
    ground=guide['sourceGroundZ'];add('root',(0,0,ground),(0,0,ground+.1))
    for name,a,b,parent in [('hips','hips','spine','root'),('spine','spine','chest','hips'),('chest','chest','neck','spine'),('neck','neck','head','chest'),('head','head','nose','neck')]:add(name,p[a],p[b],parent)
    for side,sign in [('L',1),('R',-1)]:
        mirror=lambda v:(v[0]*sign,v[1],v[2])
        add('ear.'+side,mirror(p['ear']),mirror(p['earTip']),'head')
        for limb,parent in [('front','chest'),('rear','hips')]:
            chain=[('upper','Hip','Knee',parent),('lower','Knee','Hock' if limb+'Hock' in p else 'Ankle',f'{limb}.upper.{side}')]
            if limb+'Hock' in p:chain.append(('cannon','Hock','Ankle',f'{limb}.lower.{side}'))
            chain.append(('foot','Ankle','Toe',f'{limb}.cannon.{side}' if limb+'Hock' in p else f'{limb}.lower.{side}'))
            for part,a,b,par in chain:add(f'{limb}.{part}.{side}',mirror(p[limb+a]),mirror(p[limb+b]),par)
    for i in range(len(p['tail'])-1):add(f'tail.{i}',p['tail'][i],p['tail'][i+1],'hips' if i==0 else f'tail.{i-1}')
    bpy.ops.object.mode_set(mode='OBJECT');groups={b.name:mesh.vertex_groups.new(name=b.name) for b in data.bones};r=guide['regions']
    body=['hips','spine','chest','neck'];tail=[n for n in segments if n.startswith('tail.')]
    for i,point in enumerate(source_points):
        x,y,z=point;side='L' if x>=0 else 'R'
        if y>r['tailY'] and z>r['tailZ']:candidates=tail+(['hips'] if y<r['tailY']+.10 else [])
        elif y<r['headY'] and z>r['headZ']:
            candidates=['head','neck']+(['ear.'+side] if z>r['earZ'] else [])
        elif z<r['legZ']:
            limb='front' if y<r['frontSplitY'] else 'rear';candidates=[f'{limb}.{part}.{side}' for part in (['upper','lower','cannon','foot'] if limb+'Hock' in p else ['upper','lower','foot'])]
            if z>r['legZ']-.13:candidates+=['chest' if limb=='front' else 'hips']
        else:candidates=body+(['head'] if y<r['headY']+.1 else [])
        near=sorted(((distance(point,*segments[n]),n) for n in candidates))[:2]
        weights=[1/max(.015,d)**3 for d,n in near];total=sum(weights)
        for (d,n),w in zip(near,weights):groups[n].add([i],w/total,'REPLACE')
    mod=mesh.modifiers.new('Skin','ARMATURE');mod.object=arm;mesh.parent=arm
    return arm
