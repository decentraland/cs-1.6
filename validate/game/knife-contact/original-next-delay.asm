
cs.so:	file format elf32-i386

Disassembly of section .text:

00135f00 <CBasePlayerWeapon::GetNextAttackDelay(float)>:
  135f00: 8b 44 24 04                  	movl	0x4(%esp), %eax
  135f04: d9 44 24 08                  	flds	0x8(%esp)
  135f08: d9 80 4c 01 00 00            	flds	0x14c(%eax)
  135f0e: d9 ee                        	fldz
  135f10: d9 c9                        	fxch	%st(1)
  135f12: db e9                        	fucomi	%st(1), %st
  135f14: dd d9                        	fstp	%st(1)
  135f16: 7a 68                        	jp	0x135f80 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x80>
  135f18: 75 66                        	jne	0x135f80 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x80>
  135f1a: dd d8                        	fstp	%st(0)
  135f1c: eb 04                        	jmp	0x135f22 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x22>
  135f1e: 66 90                        	nop
  135f20: dd d8                        	fstp	%st(0)
  135f22: 8b 15 00 00 00 00            	movl	0x0, %edx
  135f28: d9 02                        	flds	(%edx)
  135f2a: d9 90 4c 01 00 00            	fsts	0x14c(%eax)
  135f30: d9 c9                        	fxch	%st(1)
  135f32: d9 90 48 01 00 00            	fsts	0x148(%eax)
  135f38: d9 02                        	flds	(%edx)
  135f3a: dc e2                        	fsub	%st, %st(2)
  135f3c: d9 ee                        	fldz
  135f3e: d9 cb                        	fxch	%st(3)
  135f40: db eb                        	fucomi	%st(3), %st
  135f42: 76 1c                        	jbe	0x135f60 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x60>
  135f44: dd db                        	fstp	%st(3)
  135f46: d9 c9                        	fxch	%st(1)
  135f48: d9 ca                        	fxch	%st(2)
  135f4a: d9 80 48 01 00 00            	flds	0x148(%eax)
  135f50: de e9                        	fsubrp	%st, %st(1)
  135f52: d9 c9                        	fxch	%st(1)
  135f54: eb 12                        	jmp	0x135f68 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x68>
  135f56: 8d 76 00                     	leal	(%esi), %esi
  135f59: 8d bc 27 00 00 00 00         	leal	(%edi,%eiz), %edi
  135f60: dd d8                        	fstp	%st(0)
  135f62: d9 c9                        	fxch	%st(1)
  135f64: d9 ca                        	fxch	%st(2)
  135f66: d9 c9                        	fxch	%st(1)
  135f68: d9 98 4c 01 00 00            	fstps	0x14c(%eax)
  135f6e: d9 c9                        	fxch	%st(1)
  135f70: d8 05 34 12 1d 00            	fadds	0x1d1234
  135f76: de e1                        	fsubp	%st, %st(1)
  135f78: d9 90 48 01 00 00            	fsts	0x148(%eax)
  135f7e: c3                           	retl
  135f7f: 90                           	nop
  135f80: d9 80 c8 00 00 00            	flds	0xc8(%eax)
  135f86: d9 e8                        	fld1
  135f88: d9 e0                        	fchs
  135f8a: d9 c9                        	fxch	%st(1)
  135f8c: df e9                        	fucompi	%st(1), %st
  135f8e: dd d8                        	fstp	%st(0)
  135f90: 7b 0e                        	jnp	0x135fa0 <CBasePlayerWeapon::GetNextAttackDelay(float)+0xa0>
  135f92: d9 c9                        	fxch	%st(1)
  135f94: 8b 15 00 00 00 00            	movl	0x0, %edx
  135f9a: eb 9c                        	jmp	0x135f38 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x38>
  135f9c: 8d 74 26 00                  	leal	(%esi,%eiz), %esi
  135fa0: 0f 84 7a ff ff ff            	je	0x135f20 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x20>
  135fa6: d9 c9                        	fxch	%st(1)
  135fa8: 8b 15 00 00 00 00            	movl	0x0, %edx
  135fae: eb 88                        	jmp	0x135f38 <CBasePlayerWeapon::GetNextAttackDelay(float)+0x38>
