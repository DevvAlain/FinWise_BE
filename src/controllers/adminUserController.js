import adminUserService from '../services/adminUserService.js';

// GET /api/v1/admin/users?search=&status=&role=&page=&limit=
export const listUsers = async (req, res) => {
    try {
        const result = await adminUserService.listUsers(req.query);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('[AdminUserController] listUsers error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load users' });
    }
};

// GET /api/v1/admin/users/:id
export const getUserDetail = async (req, res) => {
    try {
        const user = await adminUserService.getUserDetail(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('[AdminUserController] getUserDetail error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load user detail' });
    }
};

// PATCH /api/v1/admin/users/:id
export const updateUser = async (req, res) => {
    try {
        const user = await adminUserService.updateUser(req.params.id, req.body);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('[AdminUserController] updateUser error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update user' });
    }
};

// PATCH /api/v1/admin/users/:id/lock
export const lockUser = async (req, res) => {
    try {
        const user = await adminUserService.lockUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('[AdminUserController] lockUser error:', error);
        return res.status(500).json({ success: false, message: 'Failed to lock user' });
    }
};

// PATCH /api/v1/admin/users/:id/unlock
export const unlockUser = async (req, res) => {
    try {
        const user = await adminUserService.unlockUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('[AdminUserController] unlockUser error:', error);
        return res.status(500).json({ success: false, message: 'Failed to unlock user' });
    }
};

// DELETE /api/v1/admin/users/:id
export const deleteUser = async (req, res) => {
    try {
        const result = await adminUserService.deleteUser(req.params.id);
        if (!result) return res.status(404).json({ success: false, message: 'User not found' });
        return res.status(200).json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('[AdminUserController] deleteUser error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
};

export default {
    listUsers,
    getUserDetail,
    updateUser,
    lockUser,
    unlockUser,
    deleteUser,
};
