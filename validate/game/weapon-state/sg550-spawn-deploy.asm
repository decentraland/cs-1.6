
/private/tmp/cs16-knife-source-audit/cs.so:	file format elf32-i386

Disassembly of section .text:

00157310 <CSG550::Deploy()>:
  157310: 53                           	pushl	%ebx
  157311: 83 ec 28                     	subl	$0x28, %esp
  157314: 8b 5c 24 30                  	movl	0x30(%esp), %ebx
  157318: 8b 03                        	movl	(%ebx), %eax
  15731a: 89 1c 24                     	movl	%ebx, (%esp)
  15731d: ff 90 74 01 00 00            	calll	*0x174(%eax)
  157323: b9 ef 93 1e 00               	movl	$0x1e93ef, %ecx         # imm = 0x1E93EF
  157328: 89 1c 24                     	movl	%ebx, (%esp)
  15732b: 89 4c 24 10                  	movl	%ecx, 0x10(%esp)
  15732f: 85 c0                        	testl	%eax, %eax
  157331: 0f 95 c0                     	setne	%al
  157334: 0f b6 c0                     	movzbl	%al, %eax
  157337: 89 44 24 14                  	movl	%eax, 0x14(%esp)
  15733b: b8 04 00 00 00               	movl	$0x4, %eax
  157340: 89 44 24 0c                  	movl	%eax, 0xc(%esp)
  157344: b8 57 44 1d 00               	movl	$0x1d4457, %eax         # imm = 0x1D4457
  157349: 89 44 24 08                  	movl	%eax, 0x8(%esp)
  15734d: b8 59 07 1e 00               	movl	$0x1e0759, %eax         # imm = 0x1E0759
  157352: 89 44 24 04                  	movl	%eax, 0x4(%esp)
  157356: e8 fc ff ff ff               	calll	0x157357 <CSG550::Deploy()+0x47>
  15735b: 83 c4 28                     	addl	$0x28, %esp
  15735e: 5b                           	popl	%ebx
  15735f: c3                           	retl

00157360 <CSG550::Spawn()>:
  157360: 53                           	pushl	%ebx
  157361: 83 ec 18                     	subl	$0x18, %esp
  157364: 8b 5c 24 20                  	movl	0x20(%esp), %ebx
  157368: 8b 03                        	movl	(%ebx), %eax
  15736a: 89 1c 24                     	movl	%ebx, (%esp)
  15736d: ff 50 04                     	calll	*0x4(%eax)
  157370: b8 0d 00 00 00               	movl	$0xd, %eax
  157375: 89 83 bc 00 00 00            	movl	%eax, 0xbc(%ebx)
  15737b: b8 d4 fd 1d 00               	movl	$0x1dfdd4, %eax         # imm = 0x1DFDD4
  157380: 89 44 24 04                  	movl	%eax, 0x4(%esp)
  157384: 8b 43 04                     	movl	0x4(%ebx), %eax
  157387: 8b 80 08 02 00 00            	movl	0x208(%eax), %eax
  15738d: 89 04 24                     	movl	%eax, (%esp)
  157390: ff 15 08 00 00 00            	calll	*0x8
  157396: b8 1e 00 00 00               	movl	$0x1e, %eax
  15739b: 89 83 f0 00 00 00            	movl	%eax, 0xf0(%ebx)
  1573a1: c7 83 0c 01 00 00 00 00 00 00	movl	$0x0, 0x10c(%ebx)
  1573ab: 89 5c 24 20                  	movl	%ebx, 0x20(%esp)
  1573af: 83 c4 18                     	addl	$0x18, %esp
  1573b2: 5b                           	popl	%ebx
  1573b3: e9 fc ff ff ff               	jmp	0x1573b4 <CSG550::Spawn()+0x54>
