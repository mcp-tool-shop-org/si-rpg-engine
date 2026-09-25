// The heap is fixed. The linker sets the memory at 512 pages and refuses to
// make it growable (solver/build.rs), so the binary cannot grow its
// memory, and solver/lint.mjs refuses any `memory.grow` instruction. Rust's std
// allocator on wasm32 is dlmalloc 0.2.13 asking `memory.grow` for more pages.
// This is the same crate at the same version, the same algorithm, with one
// difference: its only source of memory is the span from the linker's
// `__heap_base` to the end of the fixed memory, handed over once. When that is
// exhausted an allocation fails and the binary aborts; it never grows.

use core::alloc::{GlobalAlloc, Layout};
use core::sync::atomic::{AtomicBool, Ordering};

const PAGE: usize = 65536;

unsafe extern "C" {
    static __heap_base: u8;
}

struct Arena {
    given: AtomicBool,
}

unsafe impl dlmalloc::Allocator for Arena {
    fn alloc(&self, _size: usize) -> (*mut u8, usize, u32) {
        if self.given.swap(true, Ordering::Relaxed) {
            return (core::ptr::null_mut(), 0, 0);
        }
        let base = unsafe { core::ptr::addr_of!(__heap_base) as usize };
        let start = (base + 15) & !15;
        let end = core::arch::wasm32::memory_size(0) * PAGE;
        if start >= end {
            return (core::ptr::null_mut(), 0, 0);
        }
        (start as *mut u8, end - start, 0)
    }

    fn remap(&self, _ptr: *mut u8, _oldsize: usize, _newsize: usize, _can_move: bool) -> *mut u8 {
        core::ptr::null_mut()
    }

    fn free_part(&self, _ptr: *mut u8, _oldsize: usize, _newsize: usize) -> bool {
        false
    }

    fn free(&self, _ptr: *mut u8, _size: usize) -> bool {
        false
    }

    fn can_release_part(&self, _flags: u32) -> bool {
        false
    }

    fn allocates_zeros(&self) -> bool {
        true
    }

    fn page_size(&self) -> usize {
        PAGE
    }
}

struct Heap;

// The highest address any allocation has reached. The memory is fixed, so its
// page count says nothing about use; this is the heap's high-water mark, which
// harness/caps.test.js prints as pages. It lives in linear memory, so an image
// carries it.
static mut HIGH_WATER: usize = 0;

fn reached(ptr: *mut u8, size: usize) -> *mut u8 {
    if !ptr.is_null() {
        let end = ptr as usize + size;
        unsafe {
            if end > HIGH_WATER {
                HIGH_WATER = end;
            }
        }
    }
    ptr
}

/// The heap's high-water mark in bytes from address 0.
#[unsafe(no_mangle)]
pub extern "C" fn heap_high_water() -> usize {
    unsafe { HIGH_WATER }
}

static mut DLMALLOC: dlmalloc::Dlmalloc<Arena> = dlmalloc::Dlmalloc::new_with_allocator(Arena { given: AtomicBool::new(false) });

// One thread: the binary is built without atomics, as std's own wasm32
// allocator is, so no lock is taken.
unsafe impl GlobalAlloc for Heap {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        reached((*core::ptr::addr_of_mut!(DLMALLOC)).malloc(layout.size(), layout.align()), layout.size())
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        reached((*core::ptr::addr_of_mut!(DLMALLOC)).calloc(layout.size(), layout.align()), layout.size())
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        (*core::ptr::addr_of_mut!(DLMALLOC)).free(ptr, layout.size(), layout.align())
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        reached((*core::ptr::addr_of_mut!(DLMALLOC)).realloc(ptr, layout.size(), layout.align(), new_size), new_size)
    }
}

#[global_allocator]
static HEAP: Heap = Heap;
