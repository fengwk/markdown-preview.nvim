function! mkdp#autocmd#init_buf(bufnr) abort
  execute 'augroup MKDP_REFRESH_INIT' . a:bufnr
    autocmd!
    " refresh autocmd
    if g:mkdp_refresh_slow
      execute 'autocmd CursorHold,BufWrite,InsertLeave <buffer=' . a:bufnr . '> call mkdp#rpc#preview_refresh()'
    else
      execute 'autocmd CursorHold,CursorHoldI,CursorMoved,CursorMovedI <buffer=' . a:bufnr . '> call mkdp#rpc#preview_refresh()'
    endif
    " autoclose autocmd
    if g:mkdp_auto_close
      execute 'autocmd BufHidden <buffer=' . a:bufnr . '> call mkdp#rpc#preview_close()'
    endif
    " server close autocmd
    autocmd VimLeave * call mkdp#rpc#stop_server()
  augroup END
endfunction

" init preview key action
function! mkdp#autocmd#init() abort
  call mkdp#autocmd#init_buf(bufnr('%'))
endfunction

function! mkdp#autocmd#clear_buf() abort
  execute 'autocmd! ' . 'MKDP_REFRESH_INIT' . bufnr('%')
endfunction
