import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/stats
 * إحصائيات لوحة التحكم — حسب دور المستخدم الحالي.
 */
export async function GET() {
  try {
    const session = await requireRole('ADMIN', 'NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    const userId = session.user.id

    if (session.user.role === 'ADMIN') {
      const [
        totalNurses,
        pendingNurses,
        approvedNurses,
        totalReceivers,
        totalDoctors,
        pendingDoctors,
        approvedDoctors,
        totalSupervisors,
        totalAssignments,
        activeAssignments,
        receivedAssignments,
        completedAssignments,
        pendingDocuments,
        pendingReceivers,
        openPosts,
        pendingApplications,
      ] = await Promise.all([
        db.user.count({ where: { role: 'NURSE' } }),
        db.user.count({ where: { role: 'NURSE', status: 'PENDING' } }),
        db.user.count({ where: { role: 'NURSE', status: 'APPROVED' } }),
        db.user.count({ where: { role: 'RECEIVER' } }),
        db.user.count({ where: { role: 'DOCTOR' } }),
        db.user.count({ where: { role: 'DOCTOR', status: 'PENDING' } }),
        db.user.count({ where: { role: 'DOCTOR', status: 'APPROVED' } }),
        db.user.count({ where: { role: 'DOCTOR_SUPERVISOR' } }),
        db.assignment.count(),
        db.assignment.count({ where: { status: 'ACTIVE' } }),
        db.assignment.count({ where: { status: 'RECEIVED' } }),
        db.assignment.count({ where: { status: 'COMPLETED' } }),
        db.document.count({ where: { status: 'PENDING' } }),
        db.user.count({ where: { role: 'RECEIVER', status: 'PENDING' } }),
        db.post.count({ where: { status: 'OPEN' } }),
        db.application.count({ where: { status: 'PENDING' } }),
      ])

      return NextResponse.json({
        role: 'ADMIN',
        totalNurses,
        pendingNurses,
        approvedNurses,
        totalReceivers,
        pendingReceivers,
        totalDoctors,
        pendingDoctors,
        approvedDoctors,
        totalSupervisors,
        totalAssignments,
        activeAssignments,
        receivedAssignments,
        completedAssignments,
        pendingDocuments,
        openPosts,
        pendingApplications,
      })
    }

    if (session.user.role === 'NURSE' || session.user.role === 'DOCTOR') {
      const [
        myAssignments,
        activeAssignments,
        completedAssignments,
        pendingDocuments,
        approvedDocuments,
        myApplications,
        pendingApplications,
        approvedApplications,
      ] = await Promise.all([
        db.assignment.count({ where: { nurseId: userId } }),
        db.assignment.count({ where: { nurseId: userId, status: 'ACTIVE' } }),
        db.assignment.count({ where: { nurseId: userId, status: 'COMPLETED' } }),
        db.document.count({ where: { userId, status: 'PENDING' } }),
        db.document.count({ where: { userId, status: 'APPROVED' } }),
        db.application.count({ where: { nurseId: userId } }),
        db.application.count({ where: { nurseId: userId, status: 'PENDING' } }),
        db.application.count({ where: { nurseId: userId, status: 'APPROVED' } }),
      ])

      return NextResponse.json({
        role: session.user.role,
        myAssignments,
        activeAssignments,
        completedAssignments,
        pendingDocuments,
        approvedDocuments,
        myApplications,
        pendingApplications,
        approvedApplications,
      })
    }

    // RECEIVER + DOCTOR_SUPERVISOR (نفس الشكل — منظومة الأطباء)
    const [
      myAssignments,
      pendingReceipt,
      completedAssignments,
      myPosts,
      openPosts,
      pendingApplications,
    ] = await Promise.all([
      db.assignment.count({ where: { receiverId: userId } }),
      db.assignment.count({ where: { receiverId: userId, status: 'ACTIVE' } }),
      db.assignment.count({ where: { receiverId: userId, status: 'COMPLETED' } }),
      db.post.count({ where: { receiverId: userId } }),
      db.post.count({ where: { receiverId: userId, status: 'OPEN' } }),
      db.application.count({
        where: { status: 'PENDING', post: { receiverId: userId } },
      }),
    ])

    return NextResponse.json({
      role: session.user.role,
      myAssignments,
      pendingReceipt,
      completedAssignments,
      myPosts,
      openPosts,
      pendingApplications,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
